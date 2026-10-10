import { DataSource, Device, DeviceProtocol, VehicleState } from '../entities';

/** Una fuente se considera activa si reportó en los últimos 5 minutos. */
export const SOURCE_ACTIVE_MS = 5 * 60 * 1000;

export interface SourceStatus {
  /** Hay un dispositivo dado de alta que puede dar esta fuente. */
  registered: boolean;
  /** Reportó recientemente. */
  active: boolean;
  lastSeen: string | null;
}

export type VehicleSources = Record<DataSource, SourceStatus>;

function status(registered: boolean, lastSeen: string | Date | null | undefined, now: number): SourceStatus {
  const iso = lastSeen ? new Date(lastSeen).toISOString() : null;
  return { registered, active: !!iso && now - new Date(iso).getTime() < SOURCE_ACTIVE_MS, lastSeen: iso };
}

function latest(dates: (Date | string | null | undefined)[]): string | null {
  const times = dates.filter(Boolean).map((d) => new Date(d!).getTime());
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

/**
 * Qué tiene "a la mano" un vehículo: GPS físico, celular con la app y escáner ELM327.
 * Combina los dispositivos dados de alta con lo que realmente ha reportado.
 */
export function vehicleSources(devices: Device[], state: VehicleState | null, now = Date.now()): VehicleSources {
  const hardware = devices.filter((d) => d.protocol !== DeviceProtocol.MOBILE);
  const phones = devices.filter((d) => d.protocol === DeviceProtocol.MOBILE);
  return {
    gps: status(hardware.length > 0, latest([state?.sources?.gps, ...hardware.map((d) => d.lastSeenAt)]), now),
    phone: status(phones.length > 0, latest([state?.sources?.phone, ...phones.map((d) => d.lastSeenAt)]), now),
    // El escáner va conectado al celular (o a un GPS con OBD); solo se sabe que existe cuando ha mandado datos.
    scanner: status(!!state?.sources?.scanner, state?.sources?.scanner, now),
  };
}

export interface MobilePlan {
  /** full: el celular es la fuente de ubicación; backup: solo respaldo, hay GPS físico activo. */
  location: 'full' | 'backup';
  locationEverySec: number;
  sampleEverySec: number;
  readObd: boolean;
  dtcEverySec: number;
  reason: string;
}

/** Configuración que el servidor recomienda a la app según lo que tenga el vehículo. */
export function mobilePlan(sources: VehicleSources): MobilePlan {
  if (sources.gps.active) {
    return {
      location: 'backup',
      locationEverySec: 120,
      sampleEverySec: 10,
      readObd: true,
      dtcEverySec: 120,
      reason: 'El vehículo tiene GPS físico activo: el celular solo lee el escáner y manda ubicación de respaldo.',
    };
  }
  return {
    location: 'full',
    locationEverySec: 10,
    sampleEverySec: 10,
    readObd: true,
    dtcEverySec: 120,
    reason: sources.gps.registered
      ? 'El GPS físico no está reportando: el celular toma su lugar como fuente de ubicación.'
      : 'El vehículo no tiene GPS físico: el celular es la fuente de ubicación.',
  };
}
