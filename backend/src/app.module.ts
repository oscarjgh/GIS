import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeofenceCache } from './alerts/geofence-cache';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { Public } from './common/auth-user';
import { config } from './config';
import { DeviceRegistry } from './devices/device-registry.service';
import { DevicesController } from './devices/devices.controller';
import { ENTITIES } from './entities';
import { GeofencesController } from './geofences/geofences.controller';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { IngestService } from './telemetry/ingest.service';
import { MobileIngestController } from './telemetry/mobile-ingest.controller';
import { TelemetryController } from './telemetry/telemetry.controller';
import { TraccarIngestController } from './telemetry/traccar-ingest.controller';
import { TenantsController } from './tenants/tenants.controller';
import { Tk103Server } from './tk103/tk103.server';
import { UsersController } from './users/users.controller';
import { VehiclesController } from './vehicles/vehicles.controller';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true, time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: config.databaseUrl,
      entities: ENTITIES,
      synchronize: config.dbSync,
    }),
    TypeOrmModule.forFeature(ENTITIES),
    JwtModule.register({ secret: config.jwtSecret, signOptions: { expiresIn: config.jwtExpiresIn } }),
  ],
  controllers: [
    HealthController,
    AuthController,
    TenantsController,
    UsersController,
    VehiclesController,
    DevicesController,
    GeofencesController,
    TelemetryController,
    MobileIngestController,
    TraccarIngestController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService,
    DeviceRegistry,
    GeofenceCache,
    RealtimeGateway,
    IngestService,
    Tk103Server,
  ],
})
export class AppModule {}
