import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../entities';

export interface UnknownDevice {
  uniqueId: string;
  source: string;
  remoteAddress?: string;
  lastSeenAt: Date;
}

/**
 * Busca dispositivos por el identificador que reportan.
 * Los TK103 Xexun mandan un id de 12 dígitos (normalmente los últimos 12 del IMEI),
 * por eso si no hay coincidencia exacta se busca por terminación.
 */
@Injectable()
export class DeviceRegistry {
  private readonly unknown = new Map<string, UnknownDevice>();

  constructor(@InjectRepository(Device) private readonly devices: Repository<Device>) {}

  async findByReportedId(id: string): Promise<Device | null> {
    const exact = await this.devices.findOneBy({ uniqueId: id });
    if (exact) return exact;
    if (/^\d{12}$/.test(id)) {
      const matches = await this.devices
        .createQueryBuilder('d')
        .where('d.uniqueId LIKE :suffix', { suffix: `%${id}` })
        .limit(2)
        .getMany();
      if (matches.length === 1) return matches[0];
    }
    return null;
  }

  reportUnknown(uniqueId: string, source: string, remoteAddress?: string) {
    this.unknown.set(uniqueId, { uniqueId, source, remoteAddress, lastSeenAt: new Date() });
    if (this.unknown.size > 500) this.unknown.delete(this.unknown.keys().next().value!);
  }

  forgetUnknown(uniqueId: string) {
    this.unknown.delete(uniqueId);
    if (uniqueId.length > 12) this.unknown.delete(uniqueId.slice(-12));
  }

  listUnknown(): UnknownDevice[] {
    return [...this.unknown.values()].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  }
}
