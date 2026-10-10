import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('positions')
@Index(['vehicleId', 'time'])
@Index(['tenantId', 'time'])
export class Position {
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

  @Column({ type: 'double precision' })
  lat: number;

  @Column({ type: 'double precision' })
  lng: number;

  /** km/h */
  @Column({ type: 'real', default: 0 })
  speed: number;

  @Column({ type: 'real', nullable: true })
  course: number | null;

  @Column({ type: 'real', nullable: true })
  altitude: number | null;

  @Column({ type: 'boolean', nullable: true })
  ignition: boolean | null;

  @Column({ default: true })
  valid: boolean;

  @Column()
  source: string;

  @Column({ type: 'jsonb', default: {} })
  attributes: Record<string, unknown>;
}
