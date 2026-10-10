import {
  Body,
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
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Repository } from 'typeorm';
import { AuthUser, CurrentUser, resolveTenant, Roles, tenantFilter } from '../common/auth-user';
import { Device, Role, Vehicle } from '../entities';

class VehicleDto {
  @IsOptional() @IsString() name: string;
  @IsOptional() @IsString() plate?: string;
  @IsOptional() @IsString() vin?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsInt() @Min(1950) @Max(2100) year?: number;
  @IsOptional() @IsInt() @Min(10) @Max(300) speedLimit?: number;
  @IsOptional() @IsNumber() odometerKm?: number;
  @IsOptional() @IsUUID() tenantId?: string;
}

@Controller('vehicles')
export class VehiclesController {
  constructor(
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
  ) {}

  /** Lista de vehículos con su último estado: es lo que pinta el mapa al cargar. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('tenantId') tenantId?: string) {
    const t = tenantFilter(user, tenantId);
    return this.vehicles.find({ where: t ? { tenantId: t } : {}, order: { name: 'ASC' } });
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const vehicle = await this.find(user, id);
    const devices = await this.devices.findBy({ vehicleId: id });
    return { ...vehicle, devices };
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: VehicleDto) {
    const tenantId = resolveTenant(user, dto.tenantId);
    const { tenantId: _, ...data } = dto;
    return this.vehicles.save(this.vehicles.create({ ...data, name: dto.name ?? dto.plate ?? 'Vehículo', tenantId }));
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VehicleDto) {
    const vehicle = await this.find(user, id);
    const { tenantId: _, ...data } = dto;
    Object.assign(vehicle, data);
    return this.vehicles.save(vehicle);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const vehicle = await this.find(user, id);
    await this.devices.update({ vehicleId: id }, { vehicleId: null });
    await this.vehicles.remove(vehicle);
    return { ok: true };
  }

  private async find(user: AuthUser, id: string) {
    const t = tenantFilter(user);
    const vehicle = await this.vehicles.findOneBy(t ? { id, tenantId: t } : { id });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    return vehicle;
  }
}
