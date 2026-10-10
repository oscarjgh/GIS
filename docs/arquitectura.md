# Arquitectura

## Idea central: un solo formato de evento

Todo dato entrante se convierte en un `NormalizedEvent` (`backend/src/telemetry/normalized-event.ts`), sin importar si viene de la app móvil, de un GPS TK103 o de Traccar. Por eso el mapa, las alertas, las fallas y los reportes se programan una sola vez, y agregar un tipo de GPS nuevo solo requiere escribir su "traductor".

```ts
{
  deviceUid: '868683020235846',      // IMEI o id de instalación de la app
  source: 'mobile' | 'tk103_coban' | 'tk103_xexun' | 'traccar',
  time, lat, lng, speed, course, altitude, valid, ignition,
  obd: { rpm, coolantTemp, voltage, ... },
  dtcs: ['P0301'],                    // lista completa de fallas activas
  alarms: ['sos' | 'powerCut' | ...],
}
```

## Multi-cliente (multi-tenant)

- **Empresa (`tenants`)**: cada cliente. Todas las tablas operativas tienen `tenantId`.
- El evento entrante **no indica la empresa**. Se deduce así: IMEI → `devices` → `tenantId` y `vehicleId`. Un GPS no puede escribir en otra empresa.
- El `tenantId` sale del JWT del usuario y lo aplica el servidor (`resolveTenant` / `tenantFilter` en `common/auth-user.ts`). Lo que mande el cliente se ignora, salvo para el super administrador.
- **WebSocket**: cada usuario entra al cuarto `tenant:<id>` y solo recibe los eventos de su empresa.
- El IMEI es único en toda la plataforma.

| Rol | Puede |
|---|---|
| Super admin | Crear y suspender empresas, entrar a cualquiera, ver GPS no registrados |
| Administrador | Vehículos, GPS, usuarios, geocercas, comandos (incluye personalizados) |
| Operador | Ver todo, atender alertas, geocercas, comandos predefinidos |
| Chofer | Usar la app móvil (envía datos de su vehículo) |

## Tubería de ingesta (`telemetry/ingest.service.ts`)

1. Identifica el dispositivo. Si no está dado de alta, queda en "GPS desconocidos" para el super admin.
2. Guarda la posición (`positions`) y la lectura OBD (`obd_readings`).
3. Evalúa reglas (`alerts/alert-rules.ts`, funciones puras con pruebas):
   - Alarmas del GPS: SOS, corte de batería, vibración, puerta, etc.
   - Exceso de velocidad (límite por vehículo), encendido y apagado.
   - Sobrecalentamiento (≥ 105 °C) y batería baja (< 11.8 V).
   - Fallas nuevas o borradas, con descripción en español (`dtc/dtc-dictionary.ts`).
   - Entrada y salida de geocercas circulares.
   - Odómetro por distancia GPS.
4. Actualiza `vehicles.lastState`, el último estado que pinta el mapa sin consultar el historial.
5. Emite por WebSocket `vehicle` y `alert` a la empresa.

Las alertas se disparan **por flanco**: solo cuando la condición cambia, no en cada reporte. El procesamiento se serializa por vehículo para que el GPS y el celular del mismo carro no se pisen. Los eventos atrasados (los que la app guardó sin señal) se almacenan pero no cambian el estado actual.

## Detección automática de fuentes

Cada vehículo puede tener cualquier combinación de **GPS físico** (TK103/Traccar), **celular con la app** y **escáner ELM327**. El sistema detecta qué hay a la mano y se configura solo.

| Lo que tiene el vehículo | Ubicación | Datos del motor | Qué hace la app |
|---|---|---|---|
| GPS + escáner (+ celular) | GPS físico | Escáner vía celular | Lee el escáner; manda ubicación de respaldo cada 2 min |
| Solo GPS físico | GPS físico | — | No hace falta la app |
| Celular + escáner | Celular | Escáner | Ubicación cada 10 s + OBD |
| Solo celular | Celular | — | Solo ubicación |
| Solo escáner (celular sin GPS) | — | Escáner | Solo OBD |

- **Servidor** (`common/sources.ts`): `vehicleSources()` combina los dispositivos dados de alta con lo que realmente reportó (`lastState.sources`). Una fuente está *activa* si reportó en los últimos 5 min. `GET /api/ingest/mobile/config?vehicleId=` devuelve esas fuentes y el **plan** recomendado para la app.
- **Fusión de posición** (`alerts/alert-rules.ts`): mientras el GPS físico haya reportado hace menos de 2 min, su posición manda. La del celular se guarda en el historial pero no mueve el punto del mapa. Si el GPS se calla, el celular toma el relevo solo.
- **App**: al abrir, `TrackingService.autoSetup()`:
  1. consulta el plan al servidor;
  2. activa el GPS del celular (si no hay permiso, sigue solo con el escáner);
  3. busca el escáner sin preguntar: el último que funcionó, luego los Bluetooth emparejados con nombre de OBD (OBDII, V-LINK, Vgate…), luego el ELM327 WiFi;
  4. pregunta al carro qué PIDs soporta (máscaras 0100/0120/0140) y lee solo esos.

  Repite la detección cada 2 minutos: si el escáner se desconecta o el GPS físico deja de reportar, la app se reajusta.
- **Web**: íconos 📡 📱 🔧 por vehículo (atenuados si no reportan) y la tarjeta "Fuentes de datos" en el detalle, que indica cuál da la ubicación.

## API principal

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/auth/login` | Login → JWT |
| GET/POST/PATCH | `/api/tenants` | Empresas (super admin) |
| GET/POST/PATCH | `/api/users` | Usuarios de la empresa |
| GET/POST/PATCH/DELETE | `/api/vehicles` | Vehículos con último estado |
| GET | `/api/vehicles/:id/positions?from&to` | Recorrido |
| GET | `/api/vehicles/:id/obd?from&to` | Historial OBD |
| GET | `/api/vehicles/:id/dtc` | Fallas activas e historial |
| GET/POST/PATCH/DELETE | `/api/devices` | GPS y apps |
| GET | `/api/devices/:id/setup-sms` | SMS para programar el GPS |
| POST | `/api/devices/:id/commands` | Corte de motor, ubicar, intervalo |
| GET/POST/DELETE | `/api/geofences` | Geocercas |
| GET, PATCH `:id/ack` | `/api/alerts` | Alertas |
| GET | `/api/ingest/mobile/config?vehicleId=` | Fuentes del vehículo + plan para la app |
| POST | `/api/ingest/mobile` | Lotes de la app (JWT de chofer) |
| POST | `/api/ingest/traccar?token=` | Reenvío desde Traccar |
| WS | `/realtime` (Socket.IO, `auth.token`) | Eventos `vehicle`, `alert` |

## Pendientes recomendados para producción

- Migraciones de TypeORM en lugar de `DB_SYNC=true`.
- Row Level Security en PostgreSQL como segunda barrera multi-tenant.
- TimescaleDB (hypertable en `positions`) y política de retención cuando haya muchos vehículos.
- HTTPS (Caddy o Nginx + Let's Encrypt) delante de la web y la API.
- Reportes PDF/Excel, recordatorios de mantenimiento por odómetro y notificaciones push o WhatsApp.
- Soporte BLE en la app para ELM327 compatibles con iPhone.
