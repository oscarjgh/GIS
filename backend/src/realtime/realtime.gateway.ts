import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthUser } from '../common/auth-user';
import { Role } from '../entities';

const SUPERADMIN_ROOM = 'superadmin';

/**
 * WebSocket (Socket.IO) para el mapa en vivo. Cada usuario entra al "cuarto"
 * de su empresa, así nunca recibe posiciones de otro cliente.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token as string) ?? '';
      const user = this.jwt.verify<AuthUser>(token);
      if (user.role === Role.SUPERADMIN) client.join(SUPERADMIN_ROOM);
      else if (user.tenantId) client.join(`tenant:${user.tenantId}`);
      else throw new Error('sin tenant');
    } catch {
      client.disconnect(true);
    }
  }

  emit(tenantId: string, event: 'vehicle' | 'alert' | 'device', payload: unknown) {
    if (!this.server) return;
    this.server.to(`tenant:${tenantId}`).to(SUPERADMIN_ROOM).emit(event, payload);
  }
}
