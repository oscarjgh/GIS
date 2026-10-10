import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Lectura de datos en vivo OBD2 (modo 01) tomada por la app con el ELM327 o por el GPS. */
@Entity('obd_readings')
@Index(['vehicleId', 'time'])
export class ObdReading {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  deviceId: string;

  @Column({ type: 'uuid', nullable: true })
  vehicleId: string | null;

  @Column({ type: 'timestamptz' })
  time: Date;

  /** PID -> valor. Ej. { rpm: 2100, coolantTemp: 88, voltage: 13.9 } */
  @Column({ type: 'jsonb' })
  values: Record<string, number>;
}
