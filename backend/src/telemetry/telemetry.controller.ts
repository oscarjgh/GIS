import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AuthUser, CurrentUser, Roles, tenantFilter } from '../common/auth-user';
import { describeDtc } from '../dtc/dtc-dictionary';
import { Alert, DtcEvent, ObdReading, Position, Role, Vehicle } from '../entities';

const MAX_POINTS = 10000;

function range(from?: string, to?: string): { from: Date; to: Date } {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 24 * 3600 * 1000);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new BadRequestException('Fechas inválidas (usa ISO 8601)');
  if (end.getTime() - start.getTime() > 31 * 24 * 3600 * 1000) throw new BadRequestException('Rango máximo: 31 días');
  return { from: start, to: end };
}

@Controller()
export class TelemetryController {
  constructor(
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Position) private readonly positions: Repository<Position>,
    @InjectRepository(ObdReading) private readonly obd: Repository<ObdReading>,
    @InjectRepository(DtcEvent) private readonly dtc: Repository<DtcEvent>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
  ) {}

  /** Recorrido del vehículo para dibujarlo o reproducirlo en el mapa. */
  @Get('vehicles/:id/positions')
  async route(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('from') from?: string, @Query('to') to?: string) {
    const v = await this.vehicle(user, id);
    const r = range(from, to);
    return this.positions.find({
      select: ['time', 'lat', 'lng', 'speed', 'course', 'ignition', 'valid', 'source'],
      where: { vehicleId: v.id, time: Between(r.from, r.to) },
      order: { time: 'ASC' },
      take: MAX_POINTS,
    });
  }

  @Get('vehicles/:id/obd')
  async obdHistory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('from') from?: string, @Query('to') to?: string) {
    const v = await this.vehicle(user, id);
    const r = range(from, to);
    return this.obd.find({
      select: ['time', 'values'],
      where: { vehicleId: v.id, time: Between(r.from, r.to) },
      order: { time: 'ASC' },
      take: MAX_POINTS,
    });
  }

  /** Fallas activas (con descripción) + historial de apariciones/borrados. */
  @Get('vehicles/:id/dtc')
  async dtcs(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const v = await this.vehicle(user, id);
    const history = await this.dtc.find({ where: { vehicleId: v.id }, order: { time: 'DESC' }, take: 200 });
    const active = (v.lastState?.activeDtcs ?? []).map((code) => ({ code, description: describeDtc(code) }));
    return { active, history };
  }

  @Get('alerts')
  list(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('unacknowledged') unack?: string,
  ) {
    const t = tenantFilter(user, tenantId);
    const qb = this.alerts.createQueryBuilder('a').orderBy('a.time', 'DESC').take(200);
    if (t) qb.andWhere('a.tenantId = :t', { t });
    if (vehicleId) qb.andWhere('a.vehicleId = :vehicleId', { vehicleId });
    if (unack === 'true') qb.andWhere('a.acknowledged = false');
    return qb.getMany();
  }

  @Patch('alerts/:id/ack')
  @Roles(Role.ADMIN, Role.OPERATOR)
  async ack(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const t = tenantFilter(user);
    const alert = await this.alerts.findOneBy(t ? { id, tenantId: t } : { id });
    if (!alert) throw new NotFoundException();
    alert.acknowledged = true;
    return this.alerts.save(alert);
  }

  private async vehicle(user: AuthUser, id: string) {
    const t = tenantFilter(user);
    const v = await this.vehicles.findOneBy(t ? { id, tenantId: t } : { id });
    if (!v) throw new NotFoundException('Vehículo no encontrado');
    return v;
  }
}
