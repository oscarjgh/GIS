import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Empresa cliente. Todo dato operativo pertenece a un tenant. */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /** Identificador corto para subdominio o URL (ej. "transportes-lopez"). */
  @Column({ unique: true })
  slug: string;

  @Column({ default: true })
  active: boolean;

  /** Personalización visual: logo, color primario, etc. */
  @Column({ type: 'jsonb', default: {} })
  branding: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
