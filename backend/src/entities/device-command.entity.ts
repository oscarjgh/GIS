import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type CommandType = 'engineStop' | 'engineResume' | 'positionSingle' | 'positionPeriodic' | 'custom';

@Entity('device_commands')
export class DeviceCommand {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  deviceId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar' })
  type: CommandType;

  /** Texto exacto enviado al GPS. */
  @Column()
  payload: string;

  @Column({ type: 'varchar' })
  status: 'sent' | 'offline' | 'unsupported';

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
