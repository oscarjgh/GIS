# Flota GPS + OBD2 (multi-cliente)

Plataforma para **monitorear vehículos en un mapa** y **diagnosticarlos con el escáner chino OBD2 ELM327**, con soporte para **varias empresas cliente** (multi-tenant).

| Etapa | Fuente de datos | Estado |
|---|---|---|
| 1 | Celular del chofer (GPS) + escáner **ELM327** Bluetooth/WiFi | ✅ App Flutter en `mobile/` |
| 2 | **GPS chino TK103** (Coban/GPS103 y Xexun) por TCP, con comandos remotos | ✅ Servidor TCP integrado en el backend |
| 2+ | Otros GPS chinos (GT06, H02, JT808…) vía **Traccar** | ✅ Opcional (`--profile traccar`) |

```
 ETAPA 1                                   ETAPA 2
[ELM327] ─BT/WiFi─ [App Flutter]       [GPS TK103]        [GT06/H02/JT808]
                        │ HTTPS             │ TCP :5001           │ TCP
                        ▼                   ▼                     ▼
                 /api/ingest/mobile   Servidor TK103        Traccar ─► /api/ingest/traccar
                        └──────────┬────────┴─────────────────────┘
                                   ▼
                       Evento normalizado (un solo formato)
                                   ▼
            Ingesta: dispositivo → vehículo → empresa · alertas · fallas
                                   ▼
                 PostgreSQL  ──►  WebSocket por empresa  ──►  Web (mapa)
```

## Contenido del repositorio

| Carpeta | Qué es |
|---|---|
| `backend/` | API NestJS (TypeScript): multi-cliente, roles, ingesta, alertas, servidor TCP TK103, WebSocket |
| `web/` | Panel web React + Leaflet/OpenStreetMap: mapa en vivo, recorridos, OBD, fallas, GPS, geocercas |
| `mobile/` | App Flutter del chofer: ELM327 + GPS del celular, cola sin señal |
| `gateway/` | Configuración de Traccar para otros protocolos de GPS chinos |
| `docs/` | Documentación (ver abajo) |

## Documentación

| Documento | Para quién |
|---|---|
| 📘 [Manual de usuario](docs/manual-usuario.md) | Dueños de flotilla, monitoristas y choferes: cómo usar la web y la app |
| 🛠️ [Guía de instalación](docs/instalacion.md) | Quien instala: servidor, HTTPS, app móvil, respaldos, problemas comunes |
| ⚙️ [Documentación técnica](docs/documentacion-tecnica.md) | Desarrolladores: arquitectura, datos, API, cómo extender |
| 📡 [GPS TK103](docs/gps-tk103.md) | Configurar GPS chinos por SMS, comandos y otros protocolos |

## Instalación en un servidor (un solo comando)

```bash
git clone https://github.com/oscarjgh/GIS.git flota && cd flota
sudo bash scripts/instalar.sh
```

Detalles y la instalación manual en la [guía de instalación](docs/instalacion.md).

## Arranque rápido (desarrollo)

Requisitos: Node 20 o superior y PostgreSQL 14 o superior.

```bash
# 1. Base de datos
createdb flota   # o usa docker: docker run -d -p 5432:5432 -e POSTGRES_USER=flota -e POSTGRES_PASSWORD=flota -e POSTGRES_DB=flota postgres:16

# 2. Backend (API :3000 + GPS TK103 :5001)
cd backend
cp .env.example .env          # ajusta DATABASE_URL, PUBLIC_HOST, etc.
npm install
npm run seed -- --demo        # super admin + empresa demo con un vehículo y un GPS
npm run start:dev

# 3. Web (http://localhost:5173)
cd ../web
npm install
npm run dev

# 4. Simular un GPS TK103 recorriendo la CDMX (sin hardware)
cd ../backend
node scripts/simulador-tk103.js localhost 5001 868683020235846 5
```

Usuarios creados por el seed:

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin@flota.local` | `admin123` | Super administrador (tú: administra empresas) |
| `admin@demo.local` | `demo123` | Administrador de la empresa demo |
| `operador@demo.local` | `demo123` | Operador / monitorista |
| `chofer@demo.local` | `demo123` | Chofer (para la app móvil) |

## Producción con Docker (manual)

```bash
cp .env.example .env     # cambia secretos, PUBLIC_HOST y, para HTTPS, DOMAIN y WEB_PORT=8080
docker compose --profile https up -d --build   # o sin --profile https si no tienes dominio
docker compose exec backend node dist/seed.js
```

Abre en el firewall: **80/443** (web y API) y **5001/TCP** (GPS TK103). Si usas Traccar, abre también 5023/5013/5015/5093.

## Pruebas

```bash
cd backend && npm test          # decodificador TK103, reglas de alertas, mapeo Traccar
cd mobile && flutter test       # decodificador OBD2 (PIDs y códigos de falla)
```
