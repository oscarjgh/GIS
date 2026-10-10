import { Body, Controller, ForbiddenException, HttpCode, Post, Query } from '@nestjs/common';
import { Public } from '../common/auth-user';
import { config } from '../config';
import { IngestService } from './ingest.service';
import { DeviceAlarm, NormalizedEvent } from './normalized-event';

const TRACCAR_ALARMS: Record<string, DeviceAlarm> = {
  sos: 'sos',
  powerCut: 'powerCut',
  powerOff: 'powerCut',
  lowBattery: 'lowBattery',
  lowPower: 'lowBattery',
  overspeed: 'overspeed',
  vibration: 'vibration',
  movement: 'vibration',
  door: 'door',
  geofenceEnter: 'geofence',
  geofenceExit: 'geofence',
  accident: 'accident',
};

/**
 * Etapa 2 (opcional): recibe posiciones reenviadas por Traccar para soportar
 * cualquier otro GPS chino (GT06, H02, JT808...). En traccar.xml:
 *   <entry key='forward.enable'>true</entry>
 *   <entry key='forward.json'>true</entry>
 *   <entry key='forward.url'>http://backend:3000/api/ingest/traccar?token=SECRETO</entry>
 */
@Controller('ingest')
export class TraccarIngestController {
  constructor(private readonly ingest: IngestService) {}

  @Public()
  @Post('traccar')
  @HttpCode(200)
  async traccar(@Query('token') token: string, @Body() body: any) {
    if (!config.traccarForwardToken || token !== config.traccarForwardToken) throw new ForbiddenException();
    const position = body?.position;
    const uniqueId: string | undefined = body?.device?.uniqueId;
    if (!position || !uniqueId) return { ok: false };
    await this.ingest.ingest(mapTraccarPosition(uniqueId, position));
    return { ok: true };
  }
}

export function mapTraccarPosition(uniqueId: string, p: any): NormalizedEvent {
  const a = p.attributes ?? {};
  const obd: Record<string, number> = {};
  if (typeof a.rpm === 'number') obd.rpm = a.rpm;
  if (typeof a.coolantTemp === 'number') obd.coolantTemp = a.coolantTemp;
  if (typeof a.power === 'number') obd.voltage = a.power;
  if (typeof a.fuel === 'number') obd.fuelLevel = a.fuel;
  if (typeof a.engineLoad === 'number') obd.engineLoad = a.engineLoad;
  if (typeof a.throttle === 'number') obd.throttle = a.throttle;
  const alarms = String(a.alarm ?? '')
    .split(',')
    .filter(Boolean)
    .map((x) => TRACCAR_ALARMS[x] ?? 'other');
  return {
    deviceUid: uniqueId,
    source: 'traccar',
    time: new Date(p.fixTime ?? p.deviceTime ?? Date.now()),
    lat: p.latitude,
    lng: p.longitude,
    speed: typeof p.speed === 'number' ? Math.round(p.speed * 1.852 * 10) / 10 : undefined, // nudos -> km/h
    course: p.course,
    altitude: p.altitude,
    valid: p.valid !== false,
    ignition: typeof a.ignition === 'boolean' ? a.ignition : undefined,
    obd: Object.keys(obd).length ? obd : undefined,
    dtcs: typeof a.dtcs === 'string' ? a.dtcs.split(/[\s,]+/).filter(Boolean) : undefined,
    alarms: alarms.length ? alarms : undefined,
    attributes: { protocol: p.protocol },
  };
}
