import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import * as net from 'net';
import { config } from '../config';
import { DeviceRegistry } from '../devices/device-registry.service';
import { Device, DeviceProtocol } from '../entities';
import { IngestService } from '../telemetry/ingest.service';
import { decodeTk103, splitFrames, Tk103Variant } from './tk103.decoder';

interface Session {
  socket: net.Socket;
  variant: Tk103Variant;
  /** Id tal como lo reporta el equipo (15 dígitos Coban, 12 dígitos Xexun). */
  reportedId: string;
  device: Device | null;
}

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFER = 4096;

/**
 * Servidor TCP que recibe los GPS TK103. Mantiene la conexión abierta para
 * poder enviarles comandos (corte de motor, ubicar ahora, intervalo).
 */
@Injectable()
export class Tk103Server implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(Tk103Server.name);
  private server?: net.Server;
  /** deviceId -> sesión activa */
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly ingest: IngestService, private readonly registry: DeviceRegistry) {}

  onApplicationBootstrap() {
    if (config.tk103Port <= 0) return;
    this.server = net.createServer((socket) => this.handle(socket));
    this.server.on('error', (err) => this.logger.error(`Servidor TK103: ${err.message}`));
    this.server.listen(config.tk103Port, () => this.logger.log(`GPS TK103 escuchando en TCP ${config.tk103Port}`));
  }

  onApplicationShutdown() {
    this.server?.close();
    for (const s of this.sessions.values()) s.socket.destroy();
  }

  isOnline(deviceId: string): boolean {
    return this.sessions.has(deviceId);
  }

  /** Envía un comando de texto al GPS. Devuelve false si no está conectado. */
  send(deviceId: string, payload: string): boolean {
    const session = this.sessions.get(deviceId);
    if (!session) return false;
    session.socket.write(payload);
    return true;
  }

  /** Variante e id reportado de un GPS conectado (necesarios para armar comandos). */
  sessionInfo(deviceId: string): { variant: Tk103Variant; reportedId: string } | null {
    const s = this.sessions.get(deviceId);
    return s ? { variant: s.variant, reportedId: s.reportedId } : null;
  }

  private handle(socket: net.Socket) {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    let buffer = '';
    let session: Session | null = null;
    // Las tramas de una misma conexión se procesan en orden, una tras otra.
    let chain: Promise<void> = Promise.resolve();
    socket.setTimeout(IDLE_TIMEOUT_MS);
    socket.setEncoding('latin1');

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const { frames, rest } = splitFrames(buffer);
      buffer = rest.length > MAX_BUFFER ? '' : rest;
      for (const frame of frames) {
        chain = chain.then(() =>
          this.onFrame(socket, frame, remote, session)
            .then((s) => {
              session = s;
            })
            .catch((err) => this.logger.warn(`Trama TK103 con error (${remote}): ${err.message} -> ${frame}`)),
        );
      }
    });
    socket.on('timeout', () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.on('close', () => {
      if (session?.device && this.sessions.get(session.device.id) === session) this.sessions.delete(session.device.id);
    });
  }

  private async onFrame(socket: net.Socket, frame: string, remote: string, session: Session | null): Promise<Session | null> {
    const msg = decodeTk103(frame);
    if (msg.reply) socket.write(msg.reply);
    if (!msg.uniqueId) return session;

    if (!session || session.reportedId !== msg.uniqueId) {
      session = { socket, variant: msg.variant, reportedId: msg.uniqueId, device: null };
    }

    const known = session.device;
    if (msg.event) {
      session.device = await this.ingest.ingest(msg.event, remote);
    } else if (!session.device) {
      // Login o latido: identificamos el equipo para poder mandarle comandos.
      session.device = await this.registry.findByReportedId(msg.uniqueId);
      if (!session.device) this.registry.reportUnknown(msg.uniqueId, `tk103_${msg.variant}`, remote);
    }

    if (session.device && session.device.id !== known?.id) {
      const expected = session.variant === 'coban' ? DeviceProtocol.TK103_COBAN : DeviceProtocol.TK103_XEXUN;
      if (session.device.protocol !== expected) {
        this.logger.warn(`El equipo ${session.reportedId} habla ${session.variant} pero está dado de alta como ${session.device.protocol}`);
      }
      this.sessions.set(session.device.id, session);
    }
    return session;
  }
}
