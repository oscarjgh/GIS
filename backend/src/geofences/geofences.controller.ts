import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Repository } from 'typeorm';
import { AuthUser, CurrentUser, resolveTenant, Roles, tenantFilter } from '../common/auth-user';
import { Geofence, Role } from '../entities';
import { GeofenceCache } from '../alerts/geofence-cache';

class GeofenceDto {
  @IsString() name: string;
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
  @IsNumber() @Min(20) @Max(100000) radiusMeters: number;
  @IsOptional() @IsUUID() tenantId?: string;
}

@Controller('geofences')
export class GeofencesController {
  constructor(
    @InjectRepository(Geofence) private readonly geofences: Repository<Geofence>,
    private readonly cache: GeofenceCache,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('tenantId') tenantId?: string) {
    const t = tenantFilter(user, tenantId);
    return this.geofences.find({ where: t ? { tenantId: t } : {}, order: { name: 'ASC' } });
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATOR)
  async create(@CurrentUser() user: AuthUser, @Body() dto: GeofenceDto) {
    const tenantId = resolveTenant(user, dto.tenantId);
    const saved = await this.geofences.save(this.geofences.create({ ...dto, tenantId }));
    this.cache.invalidate(tenantId);
    return saved;
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OPERATOR)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const t = tenantFilter(user);
    const g = await this.geofences.findOneBy(t ? { id, tenantId: t } : { id });
    if (!g) throw new NotFoundException();
    await this.geofences.remove(g);
    this.cache.invalidate(g.tenantId);
    return { ok: true };
  }
}
