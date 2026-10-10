import { evaluateEvent, RuleContext } from '../src/alerts/alert-rules';
import { mobilePlan, vehicleSources } from '../src/common/sources';
import { Device, DeviceProtocol } from '../src/entities';
import { NormalizedEvent } from '../src/telemetry/normalized-event';

const ctx: RuleContext = { vehicleName: 'V', speedLimit: 200, geofences: [] };
const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 10, 0, s));
const gps = (s: number, lat: number): NormalizedEvent => ({ deviceUid: 'g', source: 'tk103_coban', time: at(s), lat, lng: -99, speed: 30 });
const phone = (s: number, lat: number, obd?: Record<string, number>): NormalizedEvent => ({
  deviceUid: 'p',
  source: 'mobile',
  time: at(s),
  lat,
  lng: -99,
  speed: 31,
  obd,
});

describe('fusión de fuentes', () => {
  it('con GPS físico activo, el celular no mueve el punto pero sí aporta el OBD', () => {
    const s1 = evaluateEvent(null, gps(0, 19.1), ctx).state!;
    const s2 = evaluateEvent(s1, phone(10, 19.9, { rpm: 1500, speed: 33 }), ctx).state!;
    expect(s2.lat).toBe(19.1);
    expect(s2.positionSource).toBe('tk103_coban');
    expect(s2.obd).toEqual({ rpm: 1500, speed: 33 });
    expect(s2.speed).toBe(33);
    expect(Object.keys(s2.sources!).sort()).toEqual(['gps', 'phone', 'scanner']);
  });

  it('si el GPS físico deja de reportar, el celular toma el relevo', () => {
    const s1 = evaluateEvent(null, gps(0, 19.1), ctx).state!;
    const s2 = evaluateEvent(s1, phone(59 + 2 * 60, 19.2), ctx).state!;
    expect(s2.lat).toBe(19.2);
    expect(s2.positionSource).toBe('mobile');
  });

  it('solo celular: es la fuente de ubicación', () => {
    const s = evaluateEvent(null, phone(0, 19.3), ctx).state!;
    expect(s.lat).toBe(19.3);
    expect(s.sources).toEqual({ phone: at(0).toISOString() });
  });
});

describe('detección de lo disponible', () => {
  const now = at(0).getTime() + 60_000;
  const dev = (protocol: DeviceProtocol, lastSeenAt: Date | null) => ({ protocol, lastSeenAt }) as Device;

  it('GPS físico activo -> el celular queda de respaldo', () => {
    const src = vehicleSources([dev(DeviceProtocol.TK103_COBAN, at(0)), dev(DeviceProtocol.MOBILE, null)], null, now);
    expect(src.gps).toMatchObject({ registered: true, active: true });
    expect(src.phone).toMatchObject({ registered: true, active: false });
    expect(src.scanner.registered).toBe(false);
    expect(mobilePlan(src).location).toBe('backup');
  });

  it('GPS físico registrado pero apagado -> el celular es la fuente', () => {
    const src = vehicleSources([dev(DeviceProtocol.TK103_COBAN, new Date(now - 3600_000))], null, now);
    expect(src.gps).toMatchObject({ registered: true, active: false });
    expect(mobilePlan(src).location).toBe('full');
  });

  it('escáner detectado por sus datos', () => {
    const src = vehicleSources([], { time: at(0).toISOString(), sources: { scanner: at(0).toISOString() } }, now);
    expect(src.scanner).toMatchObject({ registered: true, active: true });
  });
});
