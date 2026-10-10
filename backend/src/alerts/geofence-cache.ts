import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Geofence } from '../entities';

/** Geocercas activas por tenant en memoria (se evalúan en cada posición). */
@Injectable()
export class GeofenceCache {
  private readonly cache = new Map<string, Promise<Geofence[]>>();

  constructor(@InjectRepository(Geofence) private readonly geofences: Repository<Geofence>) {}

  get(tenantId: string): Promise<Geofence[]> {
    let entry = this.cache.get(tenantId);
    if (!entry) {
      entry = this.geofences.findBy({ tenantId, active: true });
      entry.catch(() => this.cache.delete(tenantId));
      this.cache.set(tenantId, entry);
    }
    return entry;
  }

  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }
}
