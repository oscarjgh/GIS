# Guía de instalación

Cómo instalar la plataforma desde cero y dejarla funcionando en un servidor, en una computadora de desarrollo y en el celular.

## Contenido

- [A. Qué necesitas](#a-qué-necesitas)
- [B. Instalación en servidor con el script (recomendado)](#b-instalación-en-servidor-con-el-script-recomendado)
- [C. Instalación en servidor paso a paso (manual)](#c-instalación-en-servidor-paso-a-paso-manual)
- [D. Primeros pasos después de instalar](#d-primeros-pasos-después-de-instalar)
- [E. App móvil: compilar e instalar el APK](#e-app-móvil-compilar-e-instalar-el-apk)
- [F. Ambiente de desarrollo local](#f-ambiente-de-desarrollo-local)
- [G. Operación: actualizar, respaldar, registros](#g-operación-actualizar-respaldar-registros)
- [H. Solución de problemas](#h-solución-de-problemas)
- [Referencia: variables de entorno y puertos](#referencia-variables-de-entorno-y-puertos)

---

## A. Qué necesitas

### Para producción

| Elemento | Recomendación |
|---|---|
| Servidor (VPS) | Ubuntu 22.04 o 24.04, **2 vCPU, 4 GB RAM, 40 GB de disco** (alcanza para unos 200 vehículos). DigitalOcean, Hetzner, Vultr, AWS Lightsail, etc. |
| IP pública fija | La incluyen los VPS. Los GPS se programan con esta IP o con un dominio. |
| Dominio (opcional, recomendado) | Por ejemplo `flota.miempresa.com`, con un registro **A** apuntando a la IP del servidor. Sirve para tener **HTTPS**. |
| Puertos abiertos | **80** y **443** (web), **5001/TCP** (GPS TK103) y **22** (SSH) |

### Para la app móvil

- Una computadora con [Flutter](https://docs.flutter.dev/get-started/install) 3.22 o superior y Android Studio (o solo el Android SDK).
- Un celular Android 7 o superior.

### Hardware en el vehículo (opcional, según el caso)

- Escáner **ELM327** Bluetooth o WiFi (de preferencia un "v1.5" con chip PIC18F25K80).
- GPS **TK103** (Coban/GPS103 o Xexun) con una SIM con datos. Para cortar el motor necesita su relé instalado.

---

## B. Instalación en servidor con el script (recomendado)

Desde una terminal, conéctate al servidor:

```bash
ssh root@IP_DEL_SERVIDOR
```

Descarga el proyecto:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/oscarjgh/GIS.git flota
cd flota
git checkout claude/vehicle-monitoring-odb2-i8ozsw   # o main, cuando se haya integrado
```

Ejecuta el instalador:

```bash
sudo bash scripts/instalar.sh
```

El script pregunta:

| Pregunta | Ejemplo | Nota |
|---|---|---|
| Dominio para la web con HTTPS | `flota.miempresa.com` | Déjalo vacío si aún no tienes dominio (la web queda en `http://IP`) |
| IP o dominio para los GPS | (Enter = el dominio o la IP detectada) | Se usa en el SMS `adminip` |
| APN de las SIM | `internet.itelcel.com` | AT&T: `modem.nexteldata.com.mx`, Movistar: `internet.movistar.mx` |
| Correo y contraseña del super administrador | `admin@miempresa.com` | Con estos datos entras a la web la primera vez |

El script hace lo siguiente:
1. Instala Docker.
2. Genera contraseñas aleatorias en `.env`.
3. Abre los puertos si usas `ufw`.
4. Construye y arranca los contenedores.
5. Crea tu usuario.

Al final muestra la dirección de la web.

> **Guarda el archivo `.env`.** Contiene las contraseñas de la base de datos y el secreto de las sesiones. Si lo pierdes, no podrás conectarte a la base de datos existente.

---

## C. Instalación en servidor paso a paso (manual)

Si prefieres hacerlo a mano, o el script no aplica a tu sistema:

### 1. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
docker compose version        # debe mostrar v2.x
```

### 2. Descargar el proyecto

```bash
git clone https://github.com/oscarjgh/GIS.git flota && cd flota
git checkout claude/vehicle-monitoring-odb2-i8ozsw
```

### 3. Configurar `.env`

```bash
cp .env.example .env
nano .env
```

Valores mínimos (genera los secretos con `openssl rand -hex 24`):

```ini
DB_PASSWORD=un-secreto-largo
JWT_SECRET=otro-secreto-largo
PUBLIC_HOST=flota.miempresa.com      # o la IP pública
DEFAULT_APN=internet.itelcel.com
SEED_ADMIN_EMAIL=admin@miempresa.com
SEED_ADMIN_PASSWORD=una-contraseña
# Con HTTPS:
DOMAIN=flota.miempresa.com
WEB_PORT=8080
```

### 4. Arrancar

```bash
# Con dominio y HTTPS automático (Let's Encrypt):
docker compose --profile https up -d --build

# Sin dominio (web en http://IP):
docker compose up -d --build
```

### 5. Crear el super administrador

```bash
docker compose exec backend node dist/seed.js
# Opcional, empresa de prueba con datos demo:
docker compose exec backend node dist/seed.js --demo
```

### 6. Abrir puertos

En el panel de tu proveedor (o con `ufw`):

```bash
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 5001/tcp && ufw enable
```

### 7. Comprobar

```bash
docker compose ps                         # todos "running"/"healthy"
curl -s http://localhost:3000/api/health  # {"ok":true,...}
```

Abre `https://TU_DOMINIO` (o `http://IP`) e inicia sesión.

### Opcional: otros GPS chinos (GT06, H02, JT808)

1. Define `TRACCAR_FORWARD_TOKEN` en `.env`.
2. Ejecuta `docker compose --profile traccar up -d` (agrega también `--profile https` si lo usas).
3. Abre los puertos 5023, 5013, 5015 y 5093/TCP.

Detalles en [gps-tk103.md](gps-tk103.md#otros-gps-chinos-gt06-h02-jt808).

---

## D. Primeros pasos después de instalar

1. Entra a la web con el **super administrador**.
2. **Empresas → Nueva empresa**: crea tu primer cliente con su administrador.
3. Pulsa **Entrar** en esa empresa, o entra con el usuario administrador que creaste.
4. **Vehículos → Agregar vehículo**.
5. Según lo que tenga cada vehículo:
   - **GPS TK103**: en *GPS / Dispositivos* da de alta el IMEI y envía los SMS de configuración (ver [manual de usuario](manual-usuario.md#7-gps-y-dispositivos)).
   - **Celular + ELM327**: en *Usuarios* crea un usuario con rol **Chofer** e instala la app en su celular (sección E).
6. Para probar sin hardware, ejecuta desde cualquier computadora con Node:
   `node backend/scripts/simulador-tk103.js TU_SERVIDOR 5001 IMEI_DADO_DE_ALTA 5`

---

## E. App móvil: compilar e instalar el APK

```bash
cd mobile
flutter create --org com.tuempresa --project-name flota_obd --platforms=android,ios .
flutter pub get
```

**Permisos:** edita `android/app/src/main/AndroidManifest.xml` y pega los permisos de [mobile/README.md](../mobile/README.md#puesta-en-marcha) dentro de `<manifest>`. En `android/app/build.gradle`, pon `minSdkVersion 23` o mayor.

**Compilar e instalar:**

```bash
flutter build apk --release
# El APK queda en build/app/outputs/flutter-apk/app-release.apk
```

Instálalo en el celular de alguna de estas formas:
- Por cable: `flutter install`.
- Copiando el `.apk` al teléfono y abriéndolo (activa *Instalar apps de origen desconocido*).

**En la app:** en **Servidor** escribe la misma dirección de la web, por ejemplo `https://flota.miempresa.com`. La app llama a `/api` a través de la web.

> Para publicar en Google Play necesitas firmar el APK con tu propia llave: https://docs.flutter.dev/deployment/android

---

## F. Ambiente de desarrollo local

Requisitos: **Node 20+**, **PostgreSQL 14+** y Flutter (solo para la app).

```bash
# Base de datos (con Docker, o instala PostgreSQL y crea la base "flota")
docker run -d --name flota-db -p 5432:5432 \
  -e POSTGRES_USER=flota -e POSTGRES_PASSWORD=flota -e POSTGRES_DB=flota postgres:16

# Backend: API en :3000 y GPS TK103 en :5001
cd backend
cp .env.example .env
npm install
npm run seed -- --demo
npm run start:dev

# Web: http://localhost:5173 (redirige /api al backend)
cd ../web
npm install
npm run dev

# GPS simulado
cd ../backend && node scripts/simulador-tk103.js localhost 5001 868683020235846 5
```

Usuarios de prueba: `admin@flota.local / admin123` (super admin), `admin@demo.local`, `operador@demo.local`, `chofer@demo.local` (contraseña `demo123`).

**App en desarrollo:** `cd mobile && flutter run`.
- Con el celular en la misma red WiFi, usa como servidor `http://IP_DE_TU_PC:3000`.
- Para HTTP sin S, agrega `android:usesCleartextTraffic="true"` en el `AndroidManifest.xml`.

**Pruebas:**

```bash
cd backend && npm test && npm run lint
cd mobile && flutter analyze && flutter test
cd web && npm run build
```

---

## G. Operación: actualizar, respaldar, registros

| Tarea | Comando (en la carpeta del proyecto) |
|---|---|
| Ver estado | `docker compose ps` |
| Ver registros | `docker compose logs -f backend` (o `web`, `db`, `caddy`) |
| Reiniciar | `docker compose restart backend` |
| Actualizar a la última versión | `git pull && docker compose --profile https up -d --build` |
| Respaldar la base de datos | `docker compose exec -T db pg_dump -U flota flota \| gzip > respaldo-$(date +%F).sql.gz` |
| Restaurar un respaldo | `gunzip -c respaldo.sql.gz \| docker compose exec -T db psql -U flota flota` |
| Detener todo | `docker compose down` (los datos se conservan en volúmenes) |

**Respaldo automático diario** (crontab de root, `crontab -e`):

```cron
30 3 * * * cd /root/flota && docker compose exec -T db pg_dump -U flota flota | gzip > /root/respaldos/flota-$(date +\%F).sql.gz
```

Crea antes la carpeta con `mkdir -p /root/respaldos` y copia los respaldos fuera del servidor periódicamente.

---

## H. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| La web no abre con HTTPS | El dominio no apunta a la IP, o los puertos 80/443 están cerrados | Revisa con `ping TU_DOMINIO` y `docker compose logs caddy` |
| `Error: password authentication failed` en el backend | Cambiaste `DB_PASSWORD` después de crear la base | Regresa la contraseña original, o borra el volumen (`docker compose down -v`; **se pierden los datos**) |
| El GPS no aparece en línea | Puerto 5001 cerrado, APN o IMEI incorrectos | `docker compose logs backend \| grep TK103`; revisa *GPS / Dispositivos → GPS desconocidos* (como super admin) |
| La app dice "Sin conexión" | URL del servidor incorrecta o sin internet | Usa la misma dirección de la web, con `https://` |
| La app no encuentra el escáner | No está emparejado, o la llave está apagada | Ver el [manual de usuario](manual-usuario.md#13-preguntas-frecuentes) |
| Se cierra la sesión en la web | El token vence (7 días por defecto) | Vuelve a entrar; ajusta `JWT_EXPIRES_IN` |

---

## Referencia: variables de entorno y puertos

### `.env` (Docker Compose)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DB_PASSWORD` | Sí | Contraseña de PostgreSQL (se fija la primera vez que arranca la base) |
| `JWT_SECRET` | Sí | Secreto para firmar las sesiones. Si cambia, todos tendrán que volver a entrar. |
| `PUBLIC_HOST` | Sí | IP o dominio que se programa en los GPS |
| `DEFAULT_APN` | No | APN de los SMS de configuración (por defecto Telcel) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | No | Super administrador que crea `seed.js` |
| `DOMAIN` | Con HTTPS | Dominio de la web para Let's Encrypt |
| `WEB_PORT` | Con HTTPS | Pon `8080` para que Caddy use el 80 |
| `TRACCAR_FORWARD_TOKEN` | Con Traccar | Secreto compartido entre Traccar y la API |

### Backend (`backend/.env` en desarrollo)

Además de las anteriores: `DATABASE_URL`, `DB_SYNC` (crea las tablas automáticamente; `true` por defecto), `JWT_EXPIRES_IN` (`7d`), `PORT` (`3000`) y `TK103_PORT` (`5001`).

### Puertos

| Puerto | Servicio | ¿Abrir a internet? |
|---|---|---|
| 80 / 443 | Web y API (`/api`, `/socket.io`) vía Caddy/Nginx | Sí |
| 5001/TCP | GPS TK103 | Sí |
| 3000 | API directa (solo `127.0.0.1`) | No |
| 5432 | PostgreSQL (solo red interna de Docker) | No |
| 5023 / 5013 / 5015 / 5093 | Traccar (GT06 / H02 / JT808 / watch) | Solo si usas Traccar |
