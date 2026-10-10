#!/usr/bin/env bash
# Instalación de la plataforma Flota GPS + OBD2 en un servidor Ubuntu/Debian nuevo.
#
# Uso (como root o con sudo), desde la carpeta del proyecto:
#   sudo bash scripts/instalar.sh
#
# Qué hace:
#   1. Instala Docker si no está.
#   2. Crea el archivo .env con contraseñas aleatorias (pregunta dominio/IP y admin).
#   3. Abre los puertos en el firewall (si usas ufw).
#   4. Construye y arranca todo con docker compose.
#   5. Crea el usuario super administrador.
# Se puede volver a ejecutar: no sobrescribe un .env existente.
set -euo pipefail

cd "$(dirname "$0")/.."

info() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta este script como root: sudo bash scripts/instalar.sh" >&2
  exit 1
fi

# ------------------------------------------------------------------ Docker
if ! command -v docker >/dev/null 2>&1; then
  info "Instalando Docker"
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Falta el plugin 'docker compose'. Instálalo con: apt-get install -y docker-compose-plugin" >&2
  exit 1
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# ------------------------------------------------------------------ .env
random() { openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

if [[ -f .env ]]; then
  info "Usando el archivo .env existente"
else
  info "Configuración inicial"
  detected_ip=$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
  read -rp "Dominio para la web con HTTPS (ej. flota.midominio.com, vacío = sin HTTPS): " domain
  read -rp "IP pública o dominio que se programará en los GPS [${domain:-$detected_ip}]: " public_host
  public_host=${public_host:-${domain:-$detected_ip}}
  read -rp "APN de las SIM de los GPS [internet.itelcel.com]: " apn
  apn=${apn:-internet.itelcel.com}
  read -rp "Correo del super administrador [admin@flota.local]: " admin_email
  admin_email=${admin_email:-admin@flota.local}
  while true; do
    read -rsp "Contraseña del super administrador (mín. 6 caracteres): " admin_pass; echo
    [[ ${#admin_pass} -ge 6 ]] && break
    warn "Muy corta, intenta de nuevo."
  done

  {
    echo "DB_PASSWORD=$(random)"
    echo "JWT_SECRET=$(random)$(random)"
    echo "PUBLIC_HOST=$public_host"
    echo "DEFAULT_APN=$apn"
    echo "TRACCAR_FORWARD_TOKEN=$(random)"
    echo "SEED_ADMIN_EMAIL=$admin_email"
    echo "SEED_ADMIN_PASSWORD='$admin_pass'"
    if [[ -n "$domain" ]]; then
      echo "DOMAIN=$domain"
      echo "WEB_PORT=8080"
    fi
  } > .env
  chmod 600 .env
  info "Archivo .env creado (guárdalo en un lugar seguro)"
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

profiles=()
if [[ -n "${DOMAIN:-}" ]]; then
  profiles+=(--profile https)
fi

# ------------------------------------------------------------------ Firewall
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  info "Abriendo puertos en el firewall (ufw)"
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 5001/tcp >/dev/null
else
  warn "No se detectó ufw activo. Abre en el firewall de tu proveedor: 80, 443 y 5001/TCP."
fi

# ------------------------------------------------------------------ Arranque
info "Construyendo y arrancando contenedores (la primera vez tarda unos minutos)"
docker compose "${profiles[@]}" up -d --build

info "Esperando a que la API esté lista"
for _ in $(seq 1 60); do
  if docker compose exec -T backend node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    ready=1; break
  fi
  sleep 3
done
if [[ -z "${ready:-}" ]]; then
  warn "La API no respondió. Revisa los registros con: docker compose logs backend"
  exit 1
fi

info "Creando super administrador"
docker compose exec -T backend node dist/seed.js

url="http://${PUBLIC_HOST}"
[[ -n "${DOMAIN:-}" ]] && url="https://${DOMAIN}"
cat <<MSG

✅ Instalación terminada

  Web:                 $url
  Usuario:             ${SEED_ADMIN_EMAIL}
  Servidor para GPS:   ${PUBLIC_HOST}  puerto 5001
  Servidor en la app:  $url

  Ver estado:          docker compose ps
  Ver registros:       docker compose logs -f backend
  Datos de prueba:     docker compose exec backend node dist/seed.js --demo

MSG
