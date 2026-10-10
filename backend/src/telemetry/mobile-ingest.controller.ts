import { BadRequestException, Body, Controller, ForbiddenException, Get, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Repository } from 'typeorm';
import { AuthUser, CurrentUser, resolveTenant } from '../common/auth-user';
import { mobilePlan, vehicleSources } from '../common/sources';
import { Device, DeviceProtocol, Vehicle } from '../entities';
import { IngestService } from './ingest.service';
import { NormalizedEvent, ObdValues } from './normalized-event';

class MobileEventDto {
  @IsDateString() time: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
  @IsOptional() @IsNumber() speed?: number;
  @IsOptional() @IsNumber() course?: number;
  @IsOptional() @IsNumber() altitude?: number;
  /** Precisión del GPS del celular en metros. */
  @IsOptional() @IsNumber() accuracy?: number;
  @IsOptional() @IsBoolean() ignition?: boolean;
  @IsOptional() @IsObject() obd?: ObdValues;
  @IsOptional() @IsArray() @IsString({ each: true }) dtcs?: string[];
}

class MobileBatchDto {
  /** Identificador único de la instalación de la app en el celular. */
  @Matches(/^[A-Za-z0-9_-]{8,64}$/) installationId: string;
  @IsUUID() vehicleId: string;
  @IsOptional() @IsString() deviceName?: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MobileEventDto)
  events: MobileEventDto[];
}

/** Precisión peor que esto se marca como posición no válida (no dispara geocercas). */
const MAX_ACCURACY_M = 100;

/**
 * Recepción de datos de la app móvil (etapa 1): GPS del celular + ELM327.
 * La app manda lotes (también los que guardó sin señal).
 */
@Controller('ingest')
export class MobileIngestController {
  constructor(
    private readonly ingest: IngestService,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
  ) {}

  /**
   * La app pregunta qué más tiene el vehículo (p. ej. un GPS TK103 activo) para
   * configurarse sola: si hay GPS físico, el celular no gasta batería en ubicación.
   */
  @Get('mobile/config')
  async config(@CurrentUser() user: AuthUser, @Query('vehicleId', ParseUUIDPipe) vehicleId: string) {
    const tenantId = resolveTenant(user);
    const vehicle = await this.vehicles.findOneBy({ id: vehicleId, tenantId });
    if (!vehicle) throw new BadRequestException('Vehículo no encontrado en tu empresa');
    const sources = vehicleSources(await this.devices.findBy({ vehicleId }), vehicle.lastState);
    return { vehicleId, sources, plan: mobilePlan(sources) };
  }

  @Post('mobile')
  async mobile(@CurrentUser() user: AuthUser, @Body() dto: MobileBatchDto) {
    const tenantId = resolveTenant(user);
    const vehicle = await this.vehicles.findOneBy({ id: dto.vehicleId, tenantId });
    if (!vehicle) throw new BadRequestException('Vehículo no encontrado en tu empresa');

    const uniqueId = `app-${dto.installationId}`;
    let device = await this.devices.findOneBy({ uniqueId });
    if (device && device.tenantId !== tenantId) throw new ForbiddenException();
    if (!device) {
      device = await this.devices.save(
        this.devices.create({
          uniqueId,
          tenantId,
          vehicleId: vehicle.id,
          protocol: DeviceProtocol.MOBILE,
          name: dto.deviceName ?? `App de ${user.name}`,
        }),
      );
    } else if (device.vehicleId !== vehicle.id) {
      // El chofer cambió de vehículo en la app.
      device.vehicleId = vehicle.id;
      device = await this.devices.save(device);
    }

    const events = [...dto.events].sort((a, b) => a.time.localeCompare(b.time));
    for (const e of events) {
      const event: NormalizedEvent = {
        deviceUid: uniqueId,
        source: 'mobile',
        time: new Date(e.time),
        lat: e.lat,
        lng: e.lng,
        speed: e.speed,
        course: e.course,
        altitude: e.altitude,
        valid: e.accuracy === undefined || e.accuracy <= MAX_ACCURACY_M,
        ignition: e.ignition,
        obd: e.obd,
        dtcs: e.dtcs,
        attributes: e.accuracy !== undefined ? { accuracy: e.accuracy } : undefined,
      };
      await this.ingest.ingestForDevice(device, event);
    }
    return { accepted: events.length, deviceId: device.id };
  }
}
