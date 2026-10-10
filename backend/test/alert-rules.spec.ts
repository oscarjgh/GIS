import { evaluateEvent, RuleContext } from '../src/alerts/alert-rules';
import { describeDtc } from '../src/dtc/dtc-dictionary';
import { NormalizedEvent } from '../src/telemetry/normalized-event';
import { mapTraccarPosition } from '../src/telemetry/traccar-ingest.controller';

const ctx: RuleContext = {
  vehicleName: 'Camioneta 01',
  speedLimit: 90,
  geofences: [{ id: 'g1', name: 'Base', lat: 19.4326, lng: -99.1332, radiusMeters: 500 }],
};

const ev = (over: Partial<NormalizedEvent>): NormalizedEvent => ({
  deviceUid: 'x',
  source: 'mobile',
  time: new Date('2026-01-01T10:00:00Z'),
  ...over,
});

describe('reglas de alertas', () => {
  it('exceso de velocidad solo al cruzar el límite', () => {
    const r1 = evaluateEvent(null, ev({ speed: 100 }), ctx);
    expect(r1.alerts.map((a) => a.type)).toEqual(['overspeed']);
    const r2 = evaluateEvent(r1.state, ev({ speed: 110, time: new Date('2026-01-01T10:00:10Z') }), ctx);
    expect(r2.alerts).toHaveLength(0);
  });

  it('fallas nuevas y borradas', () => {
    const r1 = evaluateEvent(null, ev({ dtcs: ['p0301', 'P0420'] }), ctx);
    expect(r1.dtcChanges.map((c) => `${c.code}:${c.status}`)).toEqual(['P0301:detected', 'P0420:detected']);
    expect(r1.alerts.find((a) => a.message.includes('P0301'))!.severity).toBe('critical');
    const r2 = evaluateEvent(r1.state, ev({ dtcs: ['P0420'], time: new Date('2026-01-01T10:01:00Z') }), ctx);
    expect(r2.dtcChanges).toEqual([{ code: 'P0301', description: describeDtc('P0301'), status: 'cleared' }]);
    expect(r2.alerts).toHaveLength(0);
  });

  it('geocerca: entrada y salida', () => {
    const outside = evaluateEvent(null, ev({ lat: 19.45, lng: -99.1332 }), ctx);
    expect(outside.alerts).toHaveLength(0);
    const enter = evaluateEvent(outside.state, ev({ lat: 19.4327, lng: -99.1333, time: new Date('2026-01-01T10:05:00Z') }), ctx);
    expect(enter.alerts.map((a) => a.type)).toEqual(['geofenceEnter']);
    expect(enter.distanceKm).toBeGreaterThan(1.5);
  });

  it('sobrecalentamiento y cambio de ignición', () => {
    const r1 = evaluateEvent(null, ev({ ignition: false, obd: { coolantTemp: 90 } }), ctx);
    const r2 = evaluateEvent(r1.state, ev({ ignition: true, obd: { coolantTemp: 108 }, time: new Date('2026-01-01T10:10:00Z') }), ctx);
    expect(r2.alerts.map((a) => a.type).sort()).toEqual(['highCoolantTemp', 'ignitionOn']);
  });

  it('evento atrasado no cambia el estado pero sí reporta SOS', () => {
    const r1 = evaluateEvent(null, ev({ lat: 19.4, lng: -99.1 }), ctx);
    const old = evaluateEvent(r1.state, ev({ alarms: ['sos'], time: new Date('2025-12-31T10:00:00Z') }), ctx);
    expect(old.state).toBeNull();
    expect(old.alerts.map((a) => a.type)).toEqual(['sos']);
  });

  it('descripción genérica de DTC desconocido', () => {
    expect(describeDtc('P0399')).toContain('encendido');
    expect(describeDtc('C1234')).toContain('Chasis');
  });

  it('mapea posiciones reenviadas por Traccar', () => {
    const e = mapTraccarPosition('123', {
      fixTime: '2026-01-01T10:00:00Z',
      latitude: 19.4,
      longitude: -99.1,
      speed: 10,
      valid: true,
      protocol: 'gt06',
      attributes: { ignition: true, alarm: 'sos', power: 12.6 },
    });
    expect(e.speed).toBeCloseTo(18.5, 1);
    expect(e.alarms).toEqual(['sos']);
    expect(e.obd).toEqual({ voltage: 12.6 });
  });
});
