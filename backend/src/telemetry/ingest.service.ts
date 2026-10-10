import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { evaluateEvent } from '../alerts/alert-rules';
import { GeofenceCache } from '../alerts/geofence-cache';
import { DeviceRegistry } from '../devices/device-registry.service';
import { Alert, Device, DtcEvent, ObdReading, Position, Vehicle } from '../entities';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { hasPosition, NormalizedEvent } from './normalized-event';

/**
 * Tubería única de ingesta: TODO dato (app, TK103, Traccar) entra por aquí.
 * 1. Identifica el dispositivo -> vehículo -> empresa (tenant).
 * 2. Guarda posición, lecturas OBD y cambios de fallas.
 * 3. Evalúa reglas de alerta y actualiza el último estado del vehículo.
 * 4. Notifica por WebSocket solo a los usuarios de esa empresa.
 */
@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  /** Serializa el procesamiento por vehículo para que el estado no se pise. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly registry: DeviceRegistry,
    private readonly geofences: GeofenceCache,
    private readonly realtime: RealtimeGateway,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Position) private readonly positions: Repository<Position>,
    @InjectRepository(ObdReading) private readonly obd: Repository<ObdReading>,
    @InjectRepository(DtcEvent) private readonly dtcEvents: Repository<DtcEvent>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
  ) {}

  /** Procesa un evento de un dispositivo aún no identificado. Devuelve el dispositivo o null si no está dado de alta. */
  async ingest(event: NormalizedEvent, remoteAddress?: string): Promise<Device | null> {
    const device = await this.registry.findByReportedId(event.deviceUid);
    if (!device) {
      this.registry.reportUnknown(event.deviceUid, event.source, remoteAddress);
      return null;
    }
    await this.ingestForDevice(device, event);
    return device;
  }

  /** Procesa un evento de un dispositivo ya identificado (en orden por vehículo). */
  ingestForDevice(device: Device, event: NormalizedEvent): Promise<void> {
    const key = device.vehicleId ?? device.id;
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.process(device, event));
    this.queues.set(key, next);
    next.finally(() => {
      if (this.queues.get(key) === next) this.queues.delete(key);
    }).catch(() => undefined);
    return next;
  }

  private async process(device: Device, event: NormalizedEvent): Promise<void> {
    const { tenantId } = device;
    const vehicle = device.vehicleId ? await this.vehicles.findOneBy({ id: device.vehicleId }) : null;
    const base = { tenantId, deviceId: device.id, vehicleId: vehicle?.id ?? null };

    await this.devices.update({ id: device.id }, { lastSeenAt: new Date() });

    if (hasPosition(event)) {
      await this.positions.insert({
        ...base,
        time: event.time,
        lat: event.lat,
        lng: event.lng,
        speed: event.speed ?? event.obd?.speed ?? 0,
        course: event.course ?? null,
        altitude: event.altitude ?? null,
        ignition: event.ignition ?? null,
        valid: event.valid !== false,
        source: event.source,
        attributes: (event.attributes ?? {}) as any,
      });
    }

    if (event.obd && Object.keys(event.obd).length) {
      await this.obd.insert({ ...base, time: event.time, values: event.obd as any });
    }

    if (!vehicle) {
      // Dispositivo sin vehículo asignado: se guarda, pero no hay estado ni alertas que calcular.
      this.realtime.emit(tenantId, 'device', { deviceId: device.id, time: event.time });
      return;
    }

    const result = evaluateEvent(vehicle.lastState, event, {
      vehicleName: vehicle.name,
      speedLimit: vehicle.speedLimit,
      geofences: await this.geofences.get(tenantId),
    });

    if (result.dtcChanges.length) {
      await this.dtcEvents.insert(result.dtcChanges.map((c) => ({ ...base, time: event.time, ...c })));
    }

    if (result.state) {
      const patch: Partial<Vehicle> = { lastState: result.state };
      if (result.distanceKm > 0) patch.odometerKm = vehicle.odometerKm + result.distanceKm;
      await this.vehicles.update({ id: vehicle.id }, patch);
      this.realtime.emit(tenantId, 'vehicle', { id: vehicle.id, tenantId, name: vehicle.name, lastState: result.state });
    }

    for (const draft of result.alerts) {
      const alert = await this.alerts.save(
        this.alerts.create({
          ...base,
          ...draft,
          time: event.time,
          lat: event.lat ?? result.state?.lat ?? null,
          lng: event.lng ?? result.state?.lng ?? null,
        }),
      );
      this.realtime.emit(tenantId, 'alert', alert);
    }
  }
}
