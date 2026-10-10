import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Código de falla detectado (aparece) o resuelto (desaparece / borrado). */
@Entity('dtc_events')
@Index(['vehicleId', 'time'])
export class DtcEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid', nullable: true })
  vehicleId: string | null;

  @Column({ type: 'uuid' })
  deviceId: string;

  @Column({ type: 'timestamptz' })
  time: Date;

  @Column()
  code: string;

  @Column()
  description: string;

  @Column({ type: 'varchar' })
  status: 'detected' | 'cleared';
}
