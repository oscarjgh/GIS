import { Alert } from './alert.entity';
import { Device } from './device.entity';
import { DeviceCommand } from './device-command.entity';
import { DtcEvent } from './dtc-event.entity';
import { Geofence } from './geofence.entity';
import { ObdReading } from './obd-reading.entity';
import { Position } from './position.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { Vehicle } from './vehicle.entity';

export * from './alert.entity';
export * from './device.entity';
export * from './device-command.entity';
export * from './dtc-event.entity';
export * from './geofence.entity';
export * from './obd-reading.entity';
export * from './position.entity';
export * from './tenant.entity';
export * from './user.entity';
export * from './vehicle.entity';

export const ENTITIES = [Tenant, User, Vehicle, Device, Position, ObdReading, DtcEvent, Alert, Geofence, DeviceCommand];
