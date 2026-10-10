import { distanceMeters } from '../common/geo';
import { describeDtc, dtcSeverity, normalizeDtc } from '../dtc/dtc-dictionary';
import { AlertSeverity, AlertType, VehicleState } from '../entities';
import { DeviceAlarm, hasPosition, NormalizedEvent } from '../telemetry/normalized-event';

export const COOLANT_LIMIT_C = 105;
export const LOW_VOLTAGE_V = 11.8;
/** Saltos mayores se consideran error de GPS y no suman al odómetro. */
const MAX_ODOMETER_JUMP_M = 10000;

export interface AlertDraft {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
}

export interface DtcChange {
  code: string;
  description: string;
  status: 'detected' | 'cleared';
}

export interface RuleContext {
  vehicleName: string;
  speedLimit: number;
  geofences: { id: string; name: string; lat: number; lng: number; radiusMeters: number }[];
}

export interface RuleResult {
  /** Nuevo estado del vehículo, o null si el evento es más viejo que el último conocido. */
  state: VehicleState | null;
  alerts: AlertDraft[];
  dtcChanges: DtcChange[];
  /** Kilómetros recorridos desde la posición anterior. */
  distanceKm: number;
}

const ALARM_ALERTS: Record<DeviceAlarm, { type: AlertType; severity: AlertSeverity; label: string }> = {
  sos: { type: 'sos', severity: 'critical', label: 'Botón de pánico (SOS)' },
  powerCut: { type: 'powerCut', severity: 'critical', label: 'GPS desconectado de la batería' },
  lowBattery: { type: 'lowBattery', severity: 'warning', label: 'Batería interna del GPS baja' },
  overspeed: { type: 'overspeed', severity: 'warning', label: 'Exceso de velocidad (reportado por el GPS)' },
  vibration: { type: 'vibration', severity: 'warning', label: 'Movimiento / vibración detectada' },
  door: { type: 'door', severity: 'info', label: 'Puerta abierta' },
  geofence: { type: 'deviceAlarm', severity: 'info', label: 'Geocerca del GPS' },
  accident: { type: 'deviceAlarm', severity: 'critical', label: 'Posible accidente' },
  other: { type: 'deviceAlarm', severity: 'warning', label: 'Alarma del GPS' },
};

/**
 * Reglas de negocio puras: comparan el evento con el estado anterior del vehículo
 * y deciden qué alertas disparar. Las alertas son "de flanco": solo se disparan
 * cuando la condición cambia (no en cada reporte).
 */
export function evaluateEvent(prev: VehicleState | null, event: NormalizedEvent, ctx: RuleContext): RuleResult {
  const alerts: AlertDraft[] = [];
  const name = ctx.vehicleName;

  for (const alarm of event.alarms ?? []) {
    const a = ALARM_ALERTS[alarm] ?? ALARM_ALERTS.other;
    alerts.push({ type: a.type, severity: a.severity, message: `${name}: ${a.label}` });
  }

  // Eventos atrasados (p. ej. buffer offline de la app) se guardan pero no cambian el estado.
  if (prev && new Date(prev.time).getTime() > event.time.getTime()) {
    return { state: null, alerts, dtcChanges: [], distanceKm: 0 };
  }

  const state: VehicleState = { ...(prev ?? {}), time: event.time.toISOString(), source: event.source };
  const positioned = hasPosition(event) && event.valid !== false;
  let distanceKm = 0;

  if (positioned) {
    if (prev?.lat !== undefined && prev.lng !== undefined) {
      const d = distanceMeters(prev.lat, prev.lng, event.lat!, event.lng!);
      if (d < MAX_ODOMETER_JUMP_M) distanceKm = d / 1000;
    }
    state.lat = event.lat;
    state.lng = event.lng;
    if (event.course !== undefined) state.course = event.course;
  }

  const speed = event.speed ?? event.obd?.speed;
  if (speed !== undefined) {
    if (speed > ctx.speedLimit && (prev?.speed ?? 0) <= ctx.speedLimit) {
      alerts.push({
        type: 'overspeed',
        severity: 'warning',
        message: `${name}: exceso de velocidad ${Math.round(speed)} km/h (límite ${ctx.speedLimit})`,
      });
    }
    state.speed = speed;
  }

  if (event.ignition !== undefined) {
    if (prev?.ignition !== undefined && prev.ignition !== event.ignition) {
      alerts.push({
        type: event.ignition ? 'ignitionOn' : 'ignitionOff',
        severity: 'info',
        message: `${name}: motor ${event.ignition ? 'encendido' : 'apagado'}`,
      });
    }
    state.ignition = event.ignition;
  }

  if (event.obd) {
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(event.obd)) if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v;
    const prevObd = prev?.obd ?? {};
    if (clean.coolantTemp !== undefined && clean.coolantTemp >= COOLANT_LIMIT_C && (prevObd.coolantTemp ?? 0) < COOLANT_LIMIT_C) {
      alerts.push({
        type: 'highCoolantTemp',
        severity: 'critical',
        message: `${name}: motor sobrecalentado (${clean.coolantTemp} °C)`,
      });
    }
    if (clean.voltage !== undefined && clean.voltage < LOW_VOLTAGE_V && (prevObd.voltage ?? 99) >= LOW_VOLTAGE_V) {
      alerts.push({ type: 'lowVoltage', severity: 'warning', message: `${name}: batería baja (${clean.voltage} V)` });
    }
    state.obd = { ...prevObd, ...clean };
    if (state.ignition === undefined && clean.rpm !== undefined) state.ignition = clean.rpm > 0;
  }

  const dtcChanges: DtcChange[] = [];
  if (event.dtcs) {
    const current = [...new Set(event.dtcs.map(normalizeDtc).filter((c): c is string => !!c))].sort();
    const before = new Set(prev?.activeDtcs ?? []);
    for (const code of current) {
      if (before.has(code)) continue;
      const description = describeDtc(code);
      dtcChanges.push({ code, description, status: 'detected' });
      alerts.push({ type: 'dtc', severity: dtcSeverity(code), message: `${name}: falla ${code} - ${description}` });
    }
    for (const code of before) {
      if (!current.includes(code)) dtcChanges.push({ code, description: describeDtc(code), status: 'cleared' });
    }
    state.activeDtcs = current;
  }

  if (positioned) {
    const inside = ctx.geofences
      .filter((g) => distanceMeters(g.lat, g.lng, event.lat!, event.lng!) <= g.radiusMeters)
      .map((g) => g.id);
    if (prev?.insideGeofences) {
      for (const g of ctx.geofences) {
        const was = prev.insideGeofences.includes(g.id);
        const is = inside.includes(g.id);
        if (was !== is) {
          alerts.push({
            type: is ? 'geofenceEnter' : 'geofenceExit',
            severity: 'info',
            message: `${name}: ${is ? 'entró a' : 'salió de'} "${g.name}"`,
          });
        }
      }
    }
    state.insideGeofences = inside;
  }

  return { state, alerts, dtcChanges, distanceKm };
}
