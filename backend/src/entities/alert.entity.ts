import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AlertType =
  | 'sos'
  | 'powerCut'
  | 'lowBattery'
  | 'overspeed'
  | 'vibration'
  | 'door'
  | 'ignitionOn'
  | 'ignitionOff'
  | 'geofenceEnter'
  | 'geofenceExit'
  | 'dtc'
  | 'highCoolantTemp'
  | 'lowVoltage'
  | 'deviceAlarm';

export type AlertSeverity = 'info' | 'warning' | 'critical';

@Entity('alerts')
@Index(['tenantId', 'time'])
export class Alert {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid', nullable: true })
  vehicleId: string | null;

  @Column({ type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ type: 'timestamptz' })
  time: Date;

  @Column({ type: 'varchar' })
  type: AlertType;

  @Column({ type: 'varchar' })
  severity: AlertSeverity;

  @Column()
  message: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  @Column({ default: false })
  acknowledged: boolean;
}
