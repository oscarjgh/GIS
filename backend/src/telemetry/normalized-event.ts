/**
 * Formato único al que se convierte TODO dato entrante, venga de la app móvil
 * (ELM327 + GPS del celular), de un GPS TK103 o de Traccar. El resto del sistema
 * (mapa, alertas, reportes) solo conoce este formato.
 */
export type DeviceAlarm =
  | 'sos'
  | 'powerCut'
  | 'lowBattery'
  | 'overspeed'
  | 'vibration'
  | 'door'
  | 'geofence'
  | 'accident'
  | 'other';

export interface ObdValues {
  rpm?: number;
  speed?: number;
  coolantTemp?: number;
  intakeTemp?: number;
  engineLoad?: number;
  throttle?: number;
  fuelLevel?: number;
  voltage?: number;
  maf?: number;
  runtimeSec?: number;
  [pid: string]: number | undefined;
}

export interface NormalizedEvent {
  /** IMEI del GPS o id de instalación de la app. */
  deviceUid: string;
  source: 'mobile' | 'tk103_coban' | 'tk103_xexun' | 'traccar';
  time: Date;
  lat?: number;
  lng?: number;
  /** km/h */
  speed?: number;
  course?: number;
  altitude?: number;
  /** false cuando el GPS no tiene señal (posición vieja o LBS). */
  valid?: boolean;
  ignition?: boolean;
  obd?: ObdValues;
  /**
   * Lista completa de códigos de falla activos leídos en este momento (modo 03).
   * undefined = no se leyeron; [] = se leyeron y no hay fallas.
   */
  dtcs?: string[];
  alarms?: DeviceAlarm[];
  attributes?: Record<string, unknown>;
}

export function hasPosition(e: NormalizedEvent): e is NormalizedEvent & { lat: number; lng: number } {
  return (
    typeof e.lat === 'number' &&
    typeof e.lng === 'number' &&
    Number.isFinite(e.lat) &&
    Number.isFinite(e.lng) &&
    !(e.lat === 0 && e.lng === 0) &&
    Math.abs(e.lat) <= 90 &&
    Math.abs(e.lng) <= 180
  );
}
