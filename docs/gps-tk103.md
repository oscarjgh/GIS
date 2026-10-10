# GPS chinos TK103

"TK103" es el nombre de dos protocolos distintos que usan cientos de modelos OEM. El servidor de la plataforma (`backend/src/tk103/`) entiende **los dos** en el mismo puerto (**TCP 5001**) y detecta solo cuál habla cada equipo.

| Variante | Equipos típicos | Ejemplo de trama |
|---|---|---|
| **Coban / GPS103** (la más común) | TK103A/B, TK303, GPS-103, Coban, muchos clones | `imei:868683020235846,tracker,231015083000,,F,143000.000,A,1925.9560,N,09907.9920,W,32.40,180.5;` |
| **Xexun / Shenzhen TK103-2** | Xexun TK103-2, algunos clones con mensajes entre paréntesis | `(027028641389BR00080612A2232.9828N11404.9297E000.0022828000.0000000000L000230AA)` |

## Dar de alta un GPS

1. En la web: **GPS / Dispositivos → Dar de alta un GPS**.
   - IMEI: viene en la etiqueta o se consulta por SMS con `imei123456`.
   - Tipo: *TK103 Coban/GPS103* (si no sabes cuál es, elige este).
   - Vehículo y número de la SIM.
2. Pulsa **✉ SMS de configuración**. La web genera los SMS con la IP y el puerto de tu servidor.
3. Envía los SMS desde un celular al número de la SIM del GPS, en orden:

| SMS | Para qué |
|---|---|
| `begin123456` | Inicializa (responde "begin ok") |
| `apn123456 internet.itelcel.com` | APN de la SIM (Telcel; AT&T: `modem.nexteldata.com.mx`, Movistar: `internet.movistar.mx`) |
| `adminip123456 TU_IP 5001` | Servidor y puerto |
| `gprs123456` | Activa el envío por datos |
| `time zone123456 0` | Hora UTC (la web la muestra en hora local) |
| `fix030s***n123456` | Reporta cada 30 s sin límite |

> `123456` es la contraseña de fábrica. Si la cambiaste, indícala en el parámetro `password` de `/api/devices/:id/setup-sms`. Algunos firmwares cambian ligeramente los comandos; revisa el manual del modelo.

4. En pocos minutos el GPS aparece **● En línea** y se mueve en el mapa.
   Si no aparece, el super admin puede ver en *GPS / Dispositivos → GPS desconocidos* los equipos que se conectan sin estar dados de alta, y darlos de alta desde ahí con un clic. Muchas veces el IMEI registrado está mal escrito.

## Comandos remotos (por GPRS)

Desde la web (operador o admin), con el GPS conectado:

| Botón | Coban | Xexun |
|---|---|---|
| Ubicar ahora | `**,imei:IMEI,B` | `(ID AP00)` |
| Cortar motor | `**,imei:IMEI,J` | `(ID AV011)` |
| Restablecer motor | `**,imei:IMEI,K` | `(ID AV010)` |
| Reportar cada 30 s | `**,imei:IMEI,C,30s` | `(ID AR00001E0000)` |

Si el GPS no está conectado, el comando queda registrado como `offline` y la web muestra el texto para enviarlo por SMS (`stop123456` / `resume123456` en Coban).

⚠️ **Corte de motor**: requiere el relé instalado en la bomba de gasolina o el encendido. Úsalo solo con el vehículo detenido o a baja velocidad.

## Alarmas que se convierten en alertas

| Coban (palabra clave) | Xexun (BO01 + tipo) | Alerta |
|---|---|---|
| `help me` | `2` | SOS (crítica) |
| `ac alarm` / `power alarm` | `0` | GPS desconectado de la batería (crítica) |
| `low battery` | — | Batería interna baja |
| `move`, `sensor alarm` | `3` | Movimiento / vibración |
| `speed` | `5` | Exceso de velocidad |
| `door alarm` | — | Puerta abierta |
| `acc on` / `acc off` | — | Encendido / apagado |

## Probar sin hardware

```bash
node backend/scripts/simulador-tk103.js localhost 5001 868683020235846 5
```

Simula un GPS Coban dando vueltas por el Zócalo de la CDMX, con exceso de velocidad ocasional y un SOS.

## Otros GPS chinos (GT06, H02, JT808…)

Se reciben con Traccar como traductor. Traccar no lo ve el cliente final:

```bash
# en .env: TRACCAR_FORWARD_TOKEN=un-secreto
docker compose --profile traccar up -d
```

Da de alta el equipo en la web con tipo **"Otro GPS (vía Traccar)"** y su IMEI, y prográmalo al puerto de su protocolo:

| Protocolo | Puerto | SMS típico |
|---|---|---|
| GT06 (Concox, Jimi) | 5023 | `SERVER,0,TU_IP,5023,0#` y `APN,internet.itelcel.com#` |
| H02 (Sinotrack) | 5013 | `8040000 TU_IP 5013` y `8030000 internet.itelcel.com` (contraseña de fábrica 0000) |
| JT808 | 5015 | Según el fabricante |
