export type Role = 'superadmin' | 'admin' | 'operator' | 'driver';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
  active?: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  active: boolean;
}

export interface VehicleState {
  time: string;
  lat?: number;
  lng?: number;
  speed?: number;
  course?: number;
  ignition?: boolean;
  source?: string;
  obd?: Record<string, number>;
  activeDtcs?: string[];
}

export interface Vehicle {
  id: string;
  tenantId: string;
  name: string;
  plate?: string;
  brand?: string;
  model?: string;
  year?: number;
  speedLimit: number;
  odometerKm: number;
  lastState: VehicleState | null;
}

export type DeviceProtocol = 'mobile' | 'tk103_coban' | 'tk103_xexun' | 'traccar';

export interface Device {
  id: string;
  tenantId: string;
  vehicleId: string | null;
  uniqueId: string;
  protocol: DeviceProtocol;
  name?: string;
  simPhone?: string;
  lastSeenAt: string | null;
  online?: boolean;
}

export interface Alert {
  id: string;
  vehicleId: string | null;
  time: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  lat: number | null;
  lng: number | null;
  acknowledged: boolean;
}

export interface Geofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface Position {
  time: string;
  lat: number;
  lng: number;
  speed: number;
  ignition: boolean | null;
}

export const PROTOCOL_LABELS: Record<DeviceProtocol, string> = {
  mobile: 'App móvil (ELM327)',
  tk103_coban: 'GPS TK103 Coban/GPS103',
  tk103_xexun: 'GPS TK103 Xexun',
  traccar: 'Otro GPS (vía Traccar)',
};

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Super admin',
  admin: 'Administrador',
  operator: 'Operador',
  driver: 'Chofer',
};

export const OBD_LABELS: Record<string, { label: string; unit: string }> = {
  rpm: { label: 'RPM', unit: '' },
  speed: { label: 'Velocidad OBD', unit: 'km/h' },
  coolantTemp: { label: 'Temp. motor', unit: '°C' },
  intakeTemp: { label: 'Temp. admisión', unit: '°C' },
  engineLoad: { label: 'Carga motor', unit: '%' },
  throttle: { label: 'Acelerador', unit: '%' },
  fuelLevel: { label: 'Combustible', unit: '%' },
  voltage: { label: 'Batería', unit: 'V' },
  maf: { label: 'MAF', unit: 'g/s' },
  runtimeSec: { label: 'Tiempo encendido', unit: 's' },
};
