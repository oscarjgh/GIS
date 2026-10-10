import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum DeviceProtocol {
  /** App móvil con GPS del celular + ELM327. */
  MOBILE = 'mobile',
  /** GPS chino TK103 variante Coban / GPS103 (imei:...,tracker,...;). */
  TK103_COBAN = 'tk103_coban',
  /** GPS chino TK103 variante Xexun / Shenzhen ((027028641389BR00...)). */
  TK103_XEXUN = 'tk103_xexun',
  /** Cualquier protocolo recibido vía Traccar (GT06, H02, JT808...). */
  TRACCAR = 'traccar',
}

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  vehicleId: string | null;

  /** IMEI del GPS o identificador de instalación de la app. Único en toda la plataforma. */
  @Column({ unique: true })
  uniqueId: string;

  @Column({ type: 'enum', enum: DeviceProtocol })
  protocol: DeviceProtocol;

  @Column({ nullable: true })
  name: string;

  /** Número de la SIM del GPS, para enviar SMS de configuración. */
  @Column({ nullable: true })
  simPhone: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
