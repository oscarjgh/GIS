import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Último estado conocido del vehículo, para pintar el mapa sin consultar el historial. */
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
  insideGeofences?: string[];
  /** Fuente que dio la última posición aceptada y cuándo (para fusionar GPS físico y celular). */
  positionSource?: string;
  positionTime?: string;
  /** Última vez que reportó cada fuente de datos: gps (GPS físico), phone (celular), scanner (ELM327). */
  sources?: Partial<Record<DataSource, string>>;
}

export type DataSource = 'gps' | 'phone' | 'scanner';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  plate: string;

  @Column({ nullable: true })
  vin: string;

  @Column({ nullable: true })
  brand: string;

  @Column({ nullable: true })
  model: string;

  @Column({ type: 'int', nullable: true })
  year: number | null;

  /** Límite de velocidad para alertas (km/h). */
  @Column({ type: 'int', default: 100 })
  speedLimit: number;

  /** Odómetro para recordatorios de mantenimiento (km). */
  @Column({ type: 'double precision', default: 0 })
  odometerKm: number;

  @Column({ type: 'jsonb', nullable: true })
  lastState: VehicleState | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
