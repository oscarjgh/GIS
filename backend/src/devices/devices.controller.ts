import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateIf } from 'class-validator';
import { Repository } from 'typeorm';
import { AuthUser, CurrentUser, resolveTenant, Roles, tenantFilter } from '../common/auth-user';
import { config } from '../config';
import { CommandType, Device, DeviceCommand, DeviceProtocol, Role, Vehicle } from '../entities';
import { cobanSetupSms, encodeTk103Command } from '../tk103/tk103.encoder';
import { Tk103Server } from '../tk103/tk103.server';
import { DeviceRegistry } from './device-registry.service';

class CreateDeviceDto {
  @Matches(/^[A-Za-z0-9_-]{4,40}$/, { message: 'uniqueId: IMEI o identificador alfanumérico' })
  uniqueId: string;

  @IsEnum(DeviceProtocol) protocol: DeviceProtocol;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() simPhone?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsUUID() tenantId?: string;
}

class UpdateDeviceDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() simPhone?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() vehicleId?: string | null;
  @IsOptional() @IsEnum(DeviceProtocol) protocol?: DeviceProtocol;
}

class CommandDto {
  @IsIn(['engineStop', 'engineResume', 'positionSingle', 'positionPeriodic', 'custom'])
  type: CommandType;

  @IsOptional() @IsInt() @Min(10) @Max(3600) intervalSec?: number;
  @IsOptional() @IsString() text?: string;
}

@Controller('devices')
export class DevicesController {
  constructor(
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(DeviceCommand) private readonly commands: Repository<DeviceCommand>,
    private readonly registry: DeviceRegistry,
    private readonly tk103: Tk103Server,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('tenantId') tenantId?: string) {
    const t = tenantFilter(user, tenantId);
    const list = await this.devices.find({ where: t ? { tenantId: t } : {}, order: { createdAt: 'DESC' } });
    return list.map((d) => ({ ...d, online: this.tk103.isOnline(d.id) }));
  }

  /** GPS que se conectan pero nadie ha dado de alta (ayuda a registrar el IMEI correcto). */
  @Get('unknown')
  @Roles(Role.SUPERADMIN)
  unknown() {
    return this.registry.listUnknown();
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateDeviceDto) {
    const tenantId = resolveTenant(user, dto.tenantId);
    if (await this.devices.findOneBy({ uniqueId: dto.uniqueId })) {
      throw new ConflictException('Ese IMEI/identificador ya está registrado');
    }
    if (dto.vehicleId) await this.assertVehicle(tenantId, dto.vehicleId);
    const { tenantId: _, ...data } = dto;
    const device = await this.devices.save(this.devices.create({ ...data, tenantId }));
    this.registry.forgetUnknown(device.uniqueId);
    return device;
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeviceDto) {
    const device = await this.find(user, id);
    if (dto.vehicleId) await this.assertVehicle(device.tenantId, dto.vehicleId);
    Object.assign(device, dto);
    return this.devices.save(device);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const device = await this.find(user, id);
    await this.devices.remove(device);
    return { ok: true };
  }

  /** SMS para programar un GPS TK103 Coban y que reporte a esta plataforma. */
  @Get(':id/setup-sms')
  @Roles(Role.ADMIN)
  async setupSms(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('apn') apn?: string,
    @Query('password') password?: string,
    @Query('intervalSec') intervalSec?: string,
  ) {
    const device = await this.find(user, id);
    if (device.protocol === DeviceProtocol.MOBILE) throw new BadRequestException('La app móvil no se configura por SMS');
    return {
      simPhone: device.simPhone,
      server: { host: config.publicHost, port: config.tk103Port },
      messages: cobanSetupSms({
        host: config.publicHost,
        port: config.tk103Port,
        apn: apn || config.defaultApn,
        password: password || undefined,
        intervalSec: intervalSec ? Number(intervalSec) : undefined,
      }),
      note:
        device.protocol === DeviceProtocol.TK103_XEXUN
          ? 'Los Xexun usan comandos distintos según el modelo; consulta docs/gps-tk103.md.'
          : 'Contraseña de fábrica 123456. Envía los SMS en orden y espera la respuesta de cada uno.',
    };
  }

  @Get(':id/commands')
  async history(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const device = await this.find(user, id);
    return this.commands.find({ where: { deviceId: device.id }, order: { createdAt: 'DESC' }, take: 50 });
  }

  /** Envía un comando por GPRS al GPS conectado (corte de motor, ubicar, intervalo). */
  @Post(':id/commands')
  @Roles(Role.ADMIN, Role.OPERATOR)
  async command(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CommandDto) {
    const device = await this.find(user, id);
    if (dto.type === 'custom' && user.role !== Role.ADMIN && user.role !== Role.SUPERADMIN) {
      throw new BadRequestException('Solo un administrador puede enviar comandos personalizados');
    }
    const record = this.commands.create({ tenantId: device.tenantId, deviceId: device.id, userId: user.sub, type: dto.type });

    const session = this.tk103.sessionInfo(device.id);
    const variant =
      session?.variant ??
      (device.protocol === DeviceProtocol.TK103_COBAN ? 'coban' : device.protocol === DeviceProtocol.TK103_XEXUN ? 'xexun' : null);
    const reportedId = session?.reportedId ?? (variant === 'xexun' ? device.uniqueId.slice(-12) : device.uniqueId);
    const payload = variant ? encodeTk103Command(variant, reportedId, dto.type, dto) : null;

    if (!payload) {
      record.payload = '';
      record.status = 'unsupported';
    } else {
      record.payload = payload;
      record.status = this.tk103.send(device.id, payload) ? 'sent' : 'offline';
    }
    return this.commands.save(record);
  }

  private async find(user: AuthUser, id: string) {
    const t = tenantFilter(user);
    const device = await this.devices.findOneBy(t ? { id, tenantId: t } : { id });
    if (!device) throw new NotFoundException('Dispositivo no encontrado');
    return device;
  }

  private async assertVehicle(tenantId: string, vehicleId: string) {
    if (!(await this.vehicles.findOneBy({ id: vehicleId, tenantId }))) {
      throw new BadRequestException('El vehículo no existe en esta empresa');
    }
  }
}
