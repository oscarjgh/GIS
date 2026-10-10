# Documentación técnica

Cómo está construida la plataforma, cómo fluyen los datos y cómo extenderla. Para instalarla, ver [instalacion.md](instalacion.md); para usarla, [manual-usuario.md](manual-usuario.md).

## Contenido

1. [Visión general](#1-visión-general)
2. [Tecnologías](#2-tecnologías)
3. [Estructura del repositorio](#3-estructura-del-repositorio)
4. [Evento normalizado](#4-evento-normalizado)
5. [Backend](#5-backend)
6. [Modelo de datos](#6-modelo-de-datos)
7. [Multi-cliente y seguridad](#7-multi-cliente-y-seguridad)
8. [Tubería de ingesta y alertas](#8-tubería-de-ingesta-y-alertas)
9. [Detección automática de fuentes](#9-detección-automática-de-fuentes)
10. [Servidor GPS TK103](#10-servidor-gps-tk103)
11. [App móvil](#11-app-móvil)
12. [Web](#12-web)
13. [Referencia de la API](#13-referencia-de-la-api)
14. [Cómo extender](#14-cómo-extender)
15. [Pruebas](#15-pruebas)
16. [Despliegue](#16-despliegue)
17. [Limitaciones y pendientes](#17-limitaciones-y-pendientes)

---

## 1. Visión general

```
 ETAPA 1                                       ETAPA 2
[ELM327] ─BT/WiFi─ [App Flutter]          [GPS TK103]          [GT06/H02/JT808]
                        │ HTTPS JSON          │ TCP :5001 texto       │ TCP
                        ▼                     ▼                       ▼
              POST /api/ingest/mobile    Tk103Server            Traccar ─► POST /api/ingest/traccar
                        └───────────┬─────────┴───────────────────────┘
                                    ▼
                         NormalizedEvent (un solo formato)
                                    ▼
          IngestService: dispositivo → vehículo → tenant · reglas · fallas · estado
                                    ▼
          PostgreSQL ◄────────┤                    ├────► Socket.IO cuarto tenant:<id>
                                                                │
                                                     Web React (mapa en vivo)
```

**Principio de diseño:** cada fuente tiene un traductor a `NormalizedEvent`. A partir de ahí, todo (persistencia, reglas, mapa, alertas) es común. Agregar un tipo de GPS nuevo solo requiere su traductor.

## 2. Tecnologías

| Capa | Tecnología |
|---|---|
| Backend | Node.js 22, **NestJS 10**, TypeScript, **TypeORM** 0.3, `pg`, `@nestjs/jwt`, `bcryptjs`, `class-validator` |
| Tiempo real | Socket.IO 4 (`@nestjs/platform-socket.io`) |
| Base de datos | **PostgreSQL 16** (sin extensiones obligatorias) |
| Servidor GPS | `net` de Node (TCP) dentro del mismo proceso del backend |
| Web | **React 18**, Vite 5, React Router 6, **Leaflet** + react-leaflet, OpenStreetMap |
| App | **Flutter 3** / Dart 3: `geolocator`, `flutter_blue_classic`, `http`, `shared_preferences`, `path_provider`, `permission_handler`, `wakelock_plus` |
| Infraestructura | Docker Compose, Nginx (sirve la web y hace de proxy a la API), Caddy (HTTPS automático), Traccar (opcional) |

## 3. Estructura del repositorio

```
backend/
  src/
    main.ts, app.module.ts, config.ts, seed.ts
    entities/          Tablas (TypeORM)
    auth/              Login JWT, guard global, roles
    common/            auth-user (tenant/roles), geo (haversine), sources (detección de fuentes)
    tenants/ users/ vehicles/ devices/ geofences/   Controladores CRUD
    telemetry/         normalized-event, ingest.service, ingesta móvil y Traccar, consultas
    alerts/            alert-rules (reglas puras), geofence-cache
    dtc/               Diccionario de fallas en español
    tk103/             decoder, encoder (comandos/SMS), server (TCP)
    realtime/          Gateway Socket.IO
  test/                Pruebas Jest
  scripts/simulador-tk103.js
web/src/
  api.ts, auth.tsx, hooks.ts, types.ts, App.tsx
  components/          Layout, ObdPanel, SourceIcons, StatusBadge, Form
  pages/               Map, Vehicles, VehicleDetail, Devices, Geofences, Alerts, Users, Tenants, Login
mobile/lib/
  api/                 Cliente HTTP
  obd/                 transporte BT/WiFi, cliente ELM327, decodificador, descubrimiento
  tracking/            TrackingService (autoconfiguración y envío), cola offline
  screens/             Login, vehículo, inicio
gateway/               traccar.xml, Caddyfile
scripts/instalar.sh    Instalador para Ubuntu
docker-compose.yml
```

## 4. Evento normalizado

`backend/src/telemetry/normalized-event.ts`

```ts
interface NormalizedEvent {
  deviceUid: string;            // IMEI del GPS o "app-<installationId>"
  source: 'mobile' | 'tk103_coban' | 'tk103_xexun' | 'traccar';
  time: Date;                   // hora del dato (no la de llegada)
  lat?: number; lng?: number;   // grados decimales
  speed?: number;               // km/h
  course?: number; altitude?: number;
  valid?: boolean;              // false = sin señal GPS / LBS / precisión mala
  ignition?: boolean;
  obd?: { rpm?, speed?, coolantTemp?, intakeTemp?, engineLoad?, throttle?, fuelLevel?, voltage?, maf?, runtimeSec? };
  dtcs?: string[];              // lista COMPLETA de fallas activas; undefined = no se leyó
  alarms?: ('sos'|'powerCut'|'lowBattery'|'overspeed'|'vibration'|'door'|'geofence'|'accident'|'other')[];
  attributes?: Record<string, unknown>;   // datos crudos propios de la fuente
}
```

**La empresa (tenant) nunca viaja en el evento**: se deduce del dispositivo.

## 5. Backend

Un solo proceso NestJS (`AppModule`) que expone:
- la API REST bajo `/api`;
- Socket.IO en el namespace `/realtime`;
- el servidor TCP de GPS en `TK103_PORT`.

| Pieza | Archivo | Responsabilidad |
|---|---|---|
| `AuthGuard` (global) | `auth/auth.guard.ts` | Verifica el JWT `Bearer` en todo endpoint salvo `@Public()`, y aplica `@Roles()` (el super admin siempre pasa) |
| `resolveTenant` / `tenantFilter` | `common/auth-user.ts` | Determina el tenant de la petición (ver §7) |
| `DeviceRegistry` | `devices/device-registry.service.ts` | Busca dispositivos por id reportado (exacto, o por los últimos 12 dígitos en Xexun) y lleva la lista en memoria de equipos desconocidos (máx. 500) |
| `IngestService` | `telemetry/ingest.service.ts` | La tubería única (§8) |
| `evaluateEvent` | `alerts/alert-rules.ts` | Reglas puras: estado anterior + evento → nuevo estado, alertas, cambios de DTC, km |
| `GeofenceCache` | `alerts/geofence-cache.ts` | Geocercas activas por tenant en memoria; se invalida al crear o borrar |
| `RealtimeGateway` | `realtime/realtime.gateway.ts` | Autentica el socket con `handshake.auth.token`, lo une a `tenant:<id>` o `superadmin` y emite `vehicle`, `alert`, `device` |
| `Tk103Server` | `tk103/tk103.server.ts` | Servidor TCP, sesiones por dispositivo, envío de comandos |
| `vehicleSources` / `mobilePlan` | `common/sources.ts` | Detección de fuentes y plan para la app (§9) |

**Configuración:** `config.ts` lee las variables de entorno (ver [instalacion.md](instalacion.md#referencia-variables-de-entorno-y-puertos)). Con `DB_SYNC=true`, TypeORM crea o actualiza las tablas al arrancar.

## 6. Modelo de datos

| Tabla | Columnas clave | Notas |
|---|---|---|
| `tenants` | id, name, slug (único), active, branding (jsonb) | Empresa cliente |
| `users` | id, tenantId (null = super admin), email (único), passwordHash (bcrypt), role, active | Roles: `superadmin`, `admin`, `operator`, `driver` |
| `vehicles` | id, tenantId, name, plate, vin, brand, model, year, speedLimit, odometerKm, **lastState (jsonb)** | `lastState` = último estado para el mapa |
| `devices` | id, tenantId, vehicleId, **uniqueId (único global)**, protocol, simPhone, lastSeenAt | protocol: `mobile`, `tk103_coban`, `tk103_xexun`, `traccar` |
| `positions` | id (bigserial), tenantId, deviceId, vehicleId, time, lat, lng, speed, course, altitude, ignition, valid, source, attributes | Índices (vehicleId, time) y (tenantId, time) |
| `obd_readings` | id, tenantId, deviceId, vehicleId, time, values (jsonb) | Lecturas modo 01 |
| `dtc_events` | id, tenantId, vehicleId, deviceId, time, code, description, status (`detected`/`cleared`) | Historial de fallas |
| `alerts` | id, tenantId, vehicleId, deviceId, time, type, severity, message, lat, lng, acknowledged | |
| `geofences` | id, tenantId, name, lat, lng, radiusMeters, active | Circulares |
| `device_commands` | id, tenantId, deviceId, userId, type, payload, status (`sent`/`offline`/`unsupported`) | Bitácora de comandos |

**`vehicles.lastState`** (`VehicleState`):

```json
{
  "time": "...", "lat": 19.43, "lng": -99.13, "speed": 42, "course": 90, "ignition": true,
  "source": "mobile", "positionSource": "tk103_coban", "positionTime": "...",
  "obd": { "rpm": 1800, "coolantTemp": 90 },
  "activeDtcs": ["P0420"],
  "insideGeofences": ["<id>"],
  "sources": { "gps": "...", "phone": "...", "scanner": "..." }
}
```

## 7. Multi-cliente y seguridad

- **Aislamiento por aplicación**:
  - Todas las tablas operativas tienen `tenantId`.
  - Para usuarios normales, `resolveTenant(user)` siempre devuelve **su** tenant (lo que manden en query o body se ignora).
  - Solo el super admin puede indicar `tenantId`; con `tenantFilter` puede ver todos.
  - Toda búsqueda por id incluye el tenant (`findOneBy({ id, tenantId })`), así que un id de otra empresa responde 404.
- **Ingesta**: el tenant sale de `devices.tenantId`. El IMEI es único global, por lo que un GPS no puede escribir en otra empresa. En la ingesta móvil se valida que el vehículo pertenezca al tenant del chofer y que el `installationId` no esté registrado en otra empresa.
- **WebSocket**: cuartos por tenant; el super admin recibe todo en `superadmin` y la web filtra por la empresa seleccionada.
- **Contraseñas**: bcrypt con costo 10. `passwordHash` no se selecciona por defecto.
- **JWT**: HS256 con `JWT_SECRET` y vencimiento `JWT_EXPIRES_IN` (7 días).
- **Validación**: `ValidationPipe` global con `whitelist` (descarta campos no declarados en los DTO).
- **Traccar**: el endpoint es público pero exige `?token=TRACCAR_FORWARD_TOKEN`. Si el token está vacío, rechaza todo.
- **Red**: en Docker, la API solo escucha en `127.0.0.1:3000` y se publica a través de Nginx/Caddy.

## 8. Tubería de ingesta y alertas

`IngestService.ingest(event)` → `ingestForDevice(device, event)` → `process()`:

1. **Identificar**: `DeviceRegistry.findByReportedId(deviceUid)`. Si no existe, se agrega a "desconocidos" y se descarta.
2. **Serializar por vehículo**: una cola de promesas por `vehicleId`, para que el GPS y el celular del mismo carro no se pisen el estado.
3. `devices.lastSeenAt = now`.
4. Si hay coordenadas válidas (`hasPosition`) → `INSERT positions`. Si hay `obd` → `INSERT obd_readings`.
5. Si el dispositivo no tiene vehículo asignado, termina aquí (emite `device`).
6. `evaluateEvent(vehicle.lastState, event, ctx)`:
   - **Alarmas del dispositivo** → alerta, siempre (también en eventos atrasados).
   - **Evento atrasado** (`event.time < lastState.time`, típico del buffer offline de la app): se guarda pero no cambia el estado ni dispara reglas de flanco.
   - **Fuentes**: actualiza `sources.gps` / `phone` / `scanner`.
   - **Fusión de posición** (§9) y odómetro por haversine (descarta saltos ≥ 10 km).
   - **Velocidad**: prioridad OBD > fuente de posición aceptada. Alerta al cruzar `speedLimit`.
   - **Ignición**: alerta al cambiar. Si no hay dato, se infiere de `rpm > 0`.
   - **OBD**: alertas al cruzar `coolantTemp ≥ 105` y `voltage < 11.8`.
   - **DTC**: compara con `activeDtcs` y genera eventos `detected`/`cleared` y una alerta por falla nueva. Son críticas las P03xx, P0217, P0118, P0335, P0087 y U0100.
   - **Geocercas**: entra o sale por comparación con `insideGeofences`.
7. `INSERT dtc_events`, `UPDATE vehicles (lastState, odometerKm)`, `INSERT alerts`.
8. Emite `vehicle` (`{ id, tenantId, name, lastState }`) y `alert` al cuarto del tenant.

Todas las reglas son **de flanco**: se disparan cuando la condición cambia, no en cada reporte.

## 9. Detección automática de fuentes

**Servidor** (`common/sources.ts`):
- `vehicleSources(devices, lastState)` devuelve, para `gps`, `phone` y `scanner`, `{ registered, active, lastSeen }`.
- *Activo* = reportó hace menos de 5 min.
- El escáner se considera "registrado" cuando alguna vez mandó OBD.
- `mobilePlan(sources)` decide el plan de la app:
  - GPS físico activo → `location: 'backup'` cada 120 s;
  - si no → `location: 'full'` cada 10 s.

**Fusión de posición** (`shadowedByHardwareGps`): un evento `mobile` no actualiza `lat/lng` del estado si la última posición aceptada vino de un GPS físico hace menos de 2 min (`HARDWARE_GPS_PRIORITY_MS`). La posición del celular sí se guarda en `positions`.

**App** (`TrackingService.autoSetup`, al abrir y cada 2 min):
1. `GET /api/ingest/mobile/config?vehicleId=` → aplica el plan (intervalos, modo de ubicación).
2. Arranca el envío. Si no hay permiso o servicio de ubicación, sigue solo con OBD. Reintenta el GPS sin volver a pedir permiso.
3. Si no hay escáner (y el chofer no lo desconectó a mano), corre `ObdDiscovery.autoConnect()`:
   - último dispositivo exitoso (guardado en `SharedPreferences`);
   - Bluetooth emparejados cuyo nombre coincide con `OBD|ELM|V-LINK|VGATE|KONNWEI|ICAR|VIECAR|...`;
   - ELM327 WiFi `192.168.0.10:35000` (timeout de 2 s).
4. Tras `initialize()`, el ELM327 consulta las máscaras de PIDs soportados (`0100` → `0120` → `0140` → `0160`) y `readLiveData()` pide solo esos.

## 10. Servidor GPS TK103

Detalle de protocolos, SMS y comandos en [gps-tk103.md](gps-tk103.md).

- **Entramado** (`splitFrames`): las tramas Xexun van entre `(` y `)`; las Coban terminan en `;` o salto de línea. El resto incompleto se conserva entre paquetes TCP (máx. 4 KB).
- **Decodificación** (`decodeTk103`):
  - login, latido, posición y alarma, con la respuesta obligatoria (`LOAD`, `ON`, `(ID AP05)`, `(ID AP01HSO)`, `(ID AS01)`);
  - coordenadas NMEA `ddmm.mmmm` → decimales; nudos → km/h en Coban.
- **Sesiones**: `deviceId → socket`. Las tramas de una conexión se procesan en orden. Tiempo de inactividad: 10 min.
- **Comandos** (`encodeTk103Command`): se escriben en el socket abierto. Si no hay sesión, se registran como `offline`.

## 11. App móvil

- **ELM327** (`obd/elm327.dart`):
  - Cola de comandos; cada respuesta termina en el prompt `>`.
  - Arranque: `ATZ`, `ATE0`, `ATL0`, `ATS0`, `ATH0`, `ATAT1`, `ATSP0`; luego `0100` (búsqueda de protocolo, hasta 15 s) y `ATDPN`. Los protocolos 6–9 son CAN.
  - Fallas: `03` (en CAN el primer byte es el conteo; se soporta multi-trama y varias ECU). Borrado: `04`. Voltaje: `ATRV` como respaldo del PID 42.
- **Decodificador** (`obd/obd_decoder.dart`): funciones puras con pruebas; las fórmulas de cada PID están en `standardPids`.
- **Envío** (`tracking/tracking_service.dart`):
  - Cada `sampleEvery` (10 s): toma la última posición y lee el OBD; las fallas cada `dtcEvery` (2 min).
  - Encola el evento y cada 15 s envía lotes de hasta 200 a `/api/ingest/mobile`.
  - Un HTTP 400 descarta el lote, para no bloquear la cola.
- **Cola offline** (`tracking/offline_queue.dart`): archivo JSON Lines en el directorio de documentos de la app; máximo 20 000 eventos.
- **Segundo plano**: `geolocator` con `ForegroundNotificationConfig` (servicio en primer plano de Android) y `wakelock_plus`.
- **Identidad**: `installationId` aleatorio y persistente. El dispositivo se registra solo como `app-<installationId>` en el primer lote.

## 12. Web

- **Autenticación** (`auth.tsx`): token y usuario en `localStorage`. Un 401 cierra la sesión. El super admin elige empresa y `useApi` agrega `?tenantId=` automáticamente; `useTenantBody` lo agrega al cuerpo.
- **Tiempo real** (`hooks.ts → useRealtime`): Socket.IO a `/realtime` con `auth.token`. El mapa actualiza el vehículo con cada evento `vehicle`.
- **Estado visual** (`vehicleStatus`): gris si no reporta en más de 30 min, verde si va a más de 3 km/h, ámbar si está encendido, azul si está apagado.
- **Fuentes** (`components/SourceIcons.tsx`): combina `vehicle.sources` (del servidor) con `lastState.sources` (en vivo).
- **Desarrollo**: Vite redirige `/api` y `/socket.io` a `localhost:3000`. **Producción**: Nginx (`web/nginx.conf`) hace lo mismo hacia `backend:3000`.

## 13. Referencia de la API

Todas las rutas bajo `/api`, con JSON y `Authorization: Bearer <token>` salvo las marcadas como públicas.

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/health` | público | Estado |
| POST | `/auth/login` | público | `{email,password}` → `{accessToken,user,tenant}` |
| GET | `/auth/me` | todos | Usuario del token |
| GET/POST | `/tenants` | superadmin | Listar / crear empresa (+ primer admin) |
| PATCH | `/tenants/:id` | superadmin | `name`, `active`, `branding` |
| GET/POST | `/users` | admin | Listar / crear |
| PATCH | `/users/:id` | admin | `name`, `password`, `role`, `active` |
| GET | `/vehicles` | todos | Con `lastState` y `sources` |
| GET | `/vehicles/:id` | todos | + `devices` y `sources` |
| POST/PATCH/DELETE | `/vehicles[/:id]` | admin | CRUD |
| GET | `/vehicles/:id/positions?from&to` | todos | Recorrido (máx. 31 días, 10 000 puntos) |
| GET | `/vehicles/:id/obd?from&to` | todos | Historial OBD |
| GET | `/vehicles/:id/dtc` | todos | `{active:[{code,description}], history}` |
| GET | `/devices` | todos | Con `online` (sesión TCP abierta) |
| GET | `/devices/unknown` | superadmin | Equipos conectados sin alta |
| POST/PATCH/DELETE | `/devices[/:id]` | admin | CRUD |
| GET | `/devices/:id/setup-sms?apn&password&intervalSec` | admin | SMS de configuración |
| GET/POST | `/devices/:id/commands` | todos / admin, operator | Historial / enviar `{type, intervalSec?, text?}` |
| GET/POST/DELETE | `/geofences[/:id]` | todos / admin, operator | |
| GET | `/alerts?vehicleId&unacknowledged=true` | todos | Últimas 200 |
| PATCH | `/alerts/:id/ack` | admin, operator | Marcar atendida |
| GET | `/ingest/mobile/config?vehicleId` | todos (app) | `{sources, plan}` |
| POST | `/ingest/mobile` | todos (app) | `{installationId, vehicleId, deviceName?, events[≤500]}` |
| POST | `/ingest/traccar?token=` | público con token | Reenvío JSON de Traccar |

**WebSocket:** `io('/realtime', { auth: { token } })`. Eventos: `vehicle`, `alert`, `device`.

**Ejemplo: enviar datos como la app**

```bash
TOKEN=$(curl -s -XPOST https://servidor/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"chofer@demo.local","password":"demo123"}' | jq -r .accessToken)

curl -XPOST https://servidor/api/ingest/mobile -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "installationId": "prueba-0001", "vehicleId": "<uuid>",
  "events": [{ "time": "2026-10-10T15:30:00Z", "lat": 19.43, "lng": -99.13, "speed": 40, "accuracy": 8,
               "obd": { "rpm": 1800, "coolantTemp": 90 }, "dtcs": ["P0420"] }]
}'
```

## 14. Cómo extender

**Nuevo protocolo de GPS (traductor propio):**
1. Crea `backend/src/<protocolo>/` con un decodificador puro `texto/bytes → NormalizedEvent` y sus pruebas.
2. Agrega el valor a `DeviceProtocol` y a `NormalizedEvent.source`.
3. Crea un servidor TCP como `Tk103Server` (copiar su manejo de sesiones) y llama a `IngestService.ingest(event)`.
4. Registra el proveedor en `AppModule`, publica el puerto en `docker-compose.yml` y agrega la etiqueta en `web/src/types.ts`.

Alternativa sin código: recibirlo vía Traccar (`--profile traccar`).

**Nuevo dato OBD (PID):** agrega un `PidSpec` en `mobile/lib/obd/obd_decoder.dart` (pid, clave, bytes, fórmula) y la etiqueta en `OBD_LABELS` (web) y `_labels` (app). El backend guarda cualquier clave numérica.

**Nueva regla de alerta:** agrega el tipo a `AlertType` (`alert.entity.ts`), la lógica de flanco en `evaluateEvent` y una prueba en `backend/test/alert-rules.spec.ts`.

**Nueva descripción de falla:** agrega la entrada en `DTC_ES` (`dtc/dtc-dictionary.ts`).

## 15. Pruebas

| Comando | Cubre |
|---|---|
| `cd backend && npm test` | Decodificador y encoder TK103, entramado, reglas de alertas, geocercas, DTC, mapeo Traccar, fusión y detección de fuentes |
| `cd backend && npm run lint` | Verificación de tipos TypeScript |
| `cd mobile && flutter test` | Decodificador OBD2: PIDs, DTC CAN y antiguos, máscaras de PIDs soportados, voltaje |
| `cd mobile && flutter analyze` | Análisis estático |
| `cd web && npm run build` | Tipos y compilación |
| `node backend/scripts/simulador-tk103.js` | Prueba manual de punta a punta con un GPS simulado |

## 16. Despliegue

`docker-compose.yml`:

| Servicio | Imagen | Perfil |
|---|---|---|
| `db` | postgres:16-alpine (volumen `dbdata`) | siempre |
| `backend` | `backend/Dockerfile` (multi-etapa, Node 22) | siempre |
| `web` | `web/Dockerfile` (build Vite + Nginx) | siempre |
| `caddy` | caddy:2.8 (HTTPS Let's Encrypt, volumen `caddydata`) | `https` |
| `traccar` | traccar/traccar:6.5 (`FORWARD_URL` por variable de entorno) | `traccar` |

Pasos completos en [instalacion.md](instalacion.md).

## 17. Limitaciones y pendientes

- **Esquema**: se crea con `DB_SYNC=true`. Para producción con cambios frecuentes, conviene pasar a migraciones de TypeORM.
- **Multi-tenant**: el aislamiento es por aplicación. Como segunda barrera se puede agregar Row Level Security en PostgreSQL.
- **Volumen**: con miles de vehículos, conviene TimescaleDB (hypertable en `positions`) y una política de retención.
- **Escala horizontal**: el estado de sesiones TCP, la cola por vehículo y los GPS desconocidos viven en memoria; el backend corre como una sola instancia. Para varias instancias habría que mover eso a Redis.
- **App**: ELM327 BLE (para iPhone) no implementado; en modo solo escáner sin GPS no hay servicio en primer plano.
- **TK103 Xexun**: el significado de los bits de estado varía por firmware y se guarda crudo (`attributes.status`).
- **Pendientes funcionales**: reportes PDF/Excel, recordatorios de mantenimiento por odómetro, notificaciones push o WhatsApp, recuperación de contraseña.
