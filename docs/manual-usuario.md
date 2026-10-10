# Manual de usuario

Guía para quienes usan la plataforma día a día: dueños de flotilla, monitoristas y choferes. No hace falta saber de programación.

## Contenido

1. [¿Qué hace la plataforma?](#1-qué-hace-la-plataforma)
2. [Tipos de usuario](#2-tipos-de-usuario)
3. [Entrar a la web](#3-entrar-a-la-web)
4. [Mapa en vivo](#4-mapa-en-vivo)
5. [Detalle de un vehículo](#5-detalle-de-un-vehículo)
6. [Vehículos](#6-vehículos)
7. [GPS y dispositivos](#7-gps-y-dispositivos)
8. [Geocercas](#8-geocercas)
9. [Alertas](#9-alertas)
10. [Usuarios](#10-usuarios)
11. [Empresas (super administrador)](#11-empresas-super-administrador)
12. [App del chofer](#12-app-del-chofer)
13. [Preguntas frecuentes](#13-preguntas-frecuentes)

---

## 1. ¿Qué hace la plataforma?

- Muestra en un **mapa en tiempo real** dónde están tus vehículos.
- Lee la **computadora del motor** con un escáner OBD2 (ELM327): RPM, temperatura, batería, combustible y **códigos de falla** ("check engine") con su explicación en español.
- Avisa con **alertas** cuando pasa algo: botón de pánico, exceso de velocidad, sobrecalentamiento, una falla nueva, o un vehículo que entra o sale de una zona.
- Permite **cortar el motor a distancia** si el vehículo tiene un GPS con relé.
- Atiende a **varias empresas**: cada empresa ve solo sus vehículos.

### ¿De dónde salen los datos?

Cada vehículo puede tener una o varias de estas tres fuentes. El sistema **detecta solo** cuáles hay y lee lo disponible:

| Ícono | Fuente | Qué aporta |
|---|---|---|
| 📡 | **GPS del vehículo** (TK103 u otro GPS chino instalado) | Ubicación las 24 h, aunque nadie lleve celular. Permite cortar el motor. |
| 📱 | **Celular del chofer** con la app | Ubicación cuando el vehículo no tiene GPS instalado. |
| 🔧 | **Escáner OBD2 (ELM327)** conectado al celular | Datos del motor y códigos de falla. |

Si el vehículo tiene GPS instalado **y** el chofer lleva la app, la ubicación la da el GPS (es más estable) y el celular solo aporta los datos del motor.

## 2. Tipos de usuario

| Rol | Para quién | Qué puede hacer |
|---|---|---|
| **Super administrador** | El dueño de la plataforma | Crear y suspender empresas cliente y entrar a cualquiera de ellas |
| **Administrador** | El responsable de la flotilla en cada empresa | Todo dentro de su empresa: vehículos, GPS, usuarios, geocercas y comandos |
| **Operador / monitorista** | Quien vigila el mapa | Ver todo, atender alertas, crear geocercas, ubicar y cortar o restablecer motor |
| **Chofer** | Quien maneja | Usar la app del celular, que envía los datos de su vehículo |

## 3. Entrar a la web

1. Abre en el navegador la dirección que te dio tu administrador (por ejemplo `https://flota.miempresa.com`).
2. Escribe tu **correo** y **contraseña** y pulsa **Entrar**.
3. Para salir, pulsa **Cerrar sesión**, abajo a la izquierda.

> Si olvidaste tu contraseña, pide al administrador de tu empresa que te asigne una nueva.

## 4. Mapa en vivo

Es la pantalla principal. A la izquierda está la lista de vehículos y a la derecha el mapa.

**Colores de cada vehículo:**

| Color | Significa |
|---|---|
| 🟢 Verde | En movimiento |
| 🟠 Ámbar | Motor encendido pero detenido |
| 🔵 Azul | Apagado |
| ⚫ Gris | Sin reportar en los últimos 30 minutos |

- **Clic en un vehículo de la lista**: el mapa se centra en él.
- **Clic en el punto del mapa**: aparece una ventana con la velocidad, los datos del motor y el enlace **"Ver detalle"**.
- Junto al nombre aparecen los íconos 📡 📱 🔧 de las fuentes que tiene. Un ícono **atenuado** significa que esa fuente no está reportando.
- Si un vehículo tiene fallas activas, aparece una etiqueta amarilla ⚠ con los códigos.
- Las **alertas nuevas** salen arriba a la derecha. Al pulsarlas, el mapa va al lugar donde ocurrieron.

La pantalla se actualiza sola; no hace falta recargarla.

## 5. Detalle de un vehículo

Se abre desde el mapa o desde **Vehículos** pulsando el nombre.

- **Fuentes de datos**: qué tiene el vehículo (GPS, celular, escáner), si está reportando y cuál da la ubicación.
- **Datos del motor (OBD2)**: RPM, velocidad, temperatura, batería, combustible, etc. En rojo los valores peligrosos (motor ≥ 105 °C, batería < 11.8 V).
- **Códigos de falla**: los activos con su explicación, y el historial de cuándo aparecieron y cuándo se borraron.
- **Recorrido**: elige las fechas *Desde* y *Hasta* para ver en el mapa por dónde anduvo (punto verde = inicio, rojo = fin), con la velocidad máxima.
- **Alertas recientes** del vehículo.

## 6. Vehículos

*(Administrador)*

- **Agregar vehículo**: nombre o número económico, placas, marca, modelo, año y **límite de velocidad**. Con ese límite se disparan las alertas de exceso de velocidad.
- **Eliminar**: quita el vehículo; su historial se conserva y sus GPS quedan "sin asignar".

## 7. GPS y dispositivos

*(Administrador; el operador puede mandar comandos)*

### Dar de alta un GPS

1. Busca el **IMEI** de 15 dígitos en la etiqueta del GPS. También puedes mandarle el SMS `imei123456`.
2. Llena **Dar de alta un GPS**:
   - IMEI.
   - Tipo: si no sabes cuál es, elige *GPS TK103 Coban/GPS103*.
   - Nombre, teléfono de la SIM del GPS y vehículo.
3. Pulsa **✉ SMS de configuración**. Aparece la lista de mensajes que debes enviar desde cualquier celular al número de la SIM del GPS, **en orden** y esperando la respuesta de cada uno. Haz clic en un mensaje para copiarlo.
4. En unos minutos el GPS aparecerá como **● En línea** y se verá en el mapa.

> El celular del chofer **no** se da de alta aquí: se registra solo la primera vez que el chofer entra a la app y elige su vehículo.

### Comandos

Con el GPS **en línea**:

| Botón | Qué hace |
|---|---|
| 📍 Ubicar ahora | Pide una posición al momento |
| ⛔ Cortar motor | Apaga el vehículo (requiere relé instalado). **Úsalo solo con el vehículo detenido.** |
| ✅ Restablecer motor | Vuelve a permitir el encendido |
| ⏱ Reportar cada 30 s | Cambia la frecuencia de reporte |

Si el GPS no está en línea, el comando no se envía y la pantalla lo avisa. En equipos Coban puedes cortar o restablecer por SMS con `stop123456` / `resume123456`.

### Cambiar un GPS de vehículo

Usa el selector de la columna **Vehículo**.

## 8. Geocercas

Zonas circulares (bodega, cliente, zona de riesgo) que generan una alerta cuando un vehículo **entra** o **sale**.

1. Haz clic en el mapa donde estará el centro.
2. Escribe el nombre y el radio en metros.
3. Pulsa **Guardar**.

## 9. Alertas

| Alerta | Nivel | Origen |
|---|---|---|
| Botón de pánico (SOS) | Crítica | GPS |
| GPS desconectado de la batería | Crítica | GPS |
| Posible accidente | Crítica | GPS |
| Motor sobrecalentado (≥ 105 °C) | Crítica | Escáner |
| Falla de encendido y otras fallas graves | Crítica | Escáner |
| Exceso de velocidad | Aviso | GPS, celular o escáner |
| Batería del vehículo baja (< 11.8 V) | Aviso | Escáner |
| Otras fallas (check engine) | Aviso | Escáner |
| Movimiento / vibración, batería del GPS baja | Aviso | GPS |
| Motor encendido / apagado, puerta abierta | Info | GPS o escáner |
| Entró a / salió de una geocerca | Info | Cualquier fuente con ubicación |

En **Alertas**, marca **Solo pendientes** para ver las que nadie ha atendido y pulsa **Atendida** cuando la revises.

## 10. Usuarios

*(Administrador)*

- **Nuevo usuario**: nombre, correo, contraseña inicial y rol.
- **Desactivar / Activar**: un usuario desactivado ya no puede entrar. Úsalo en lugar de borrar.
- A los choferes dales el rol **Chofer** y pásales su correo y contraseña para la app.

## 11. Empresas (super administrador)

- **Nueva empresa**: nombre, *slug* (identificador corto, por ejemplo `transportes-lopez`) y los datos de su primer administrador.
- **Entrar**: cambia la vista a esa empresa. También puedes elegirla en el selector de arriba a la izquierda.
- **Suspender**: sus usuarios ya no pueden entrar (por ejemplo, por falta de pago). Sus datos se conservan.

## 12. App del chofer

### Antes de empezar

- Celular **Android** (el ELM327 Bluetooth no funciona con iPhone; con iPhone usa un ELM327 **WiFi**).
- Conecta el ELM327 al puerto OBD2 del vehículo, que suele estar bajo el volante.
- Bluetooth: emparéjalo una sola vez en *Ajustes → Bluetooth*. Suele llamarse `OBDII` o `V-LINK` y su PIN es `1234` o `0000`.
- WiFi: conéctate a la red del escáner (`WiFi_OBDII`).

### Uso diario

1. Abre la app. La primera vez:
   - **Servidor**: la dirección que te dio tu administrador (la misma de la web).
   - Tu **correo** y **contraseña**.
   - Elige **el vehículo que manejas**.
2. **No tienes que hacer nada más.** La tarjeta **Detección automática** muestra lo que encontró:
   - **GPS del vehículo**: si tiene uno instalado y funcionando.
   - **GPS del celular**: si está activo, y si es la fuente principal o solo de respaldo.
   - **Escáner OBD2**: si se conectó y qué datos lee de tu vehículo.
3. Acepta los permisos de **ubicación** ("Permitir siempre") y **dispositivos cercanos / Bluetooth**.
4. Puedes apagar la pantalla: la app sigue enviando, y en la barra de notificaciones aparece *"Flota OBD activo"*.
5. Si no hay señal, la app guarda los datos y los manda cuando vuelve la cobertura (ver *Pendientes*).

### Botones

| Botón | Para qué |
|---|---|
| ⟳ (en Detección automática) | Volver a buscar el escáner y el GPS ahora mismo |
| Iniciar / Detener rastreo | Pausar o reanudar el envío |
| ELM327 Bluetooth / WiFi | Conectar el escáner a mano, si la detección automática no lo encontró |
| Leer fallas | Leer los códigos de falla al momento |
| Borrar fallas | Apaga el "check engine". **Solo después de reparar**, con el motor apagado y la llave en ON |
| ⋮ → Cambiar de vehículo | Si hoy manejas otro vehículo |

## 13. Preguntas frecuentes

**El vehículo sale en gris.**
No ha reportado en 30 minutos. Revisa que el GPS tenga corriente y saldo o datos en la SIM, o que el chofer tenga la app abierta con internet.

**El GPS nunca aparece "En línea".**
- Revisa que el IMEI registrado coincida con el de la etiqueta.
- Revisa que la SIM tenga datos y que el APN sea el correcto.
- Vuelve a mandar el SMS `adminip123456 <servidor> 5001`.
- Pide al super administrador que revise *GPS / Dispositivos → GPS desconocidos*: ahí aparecen los equipos que se conectan pero no están dados de alta. Se pueden dar de alta desde ahí con el botón **Usar en el alta**.

**La app no encuentra el escáner.**
- Bluetooth: revisa que esté emparejado en los ajustes del celular.
- Pon la llave en ON o el motor encendido.
- Pulsa ⟳. Si sigue sin conectar, usa **ELM327 Bluetooth** para elegirlo a mano.
- Algunos clones "v2.1" no funcionan bien; los "v1.5" con chip PIC18F25K80 son más confiables.

**Faltan datos del motor (por ejemplo, combustible).**
No todos los vehículos entregan todos los datos por OBD2. La app lee automáticamente solo los que tu vehículo soporta.

**¿Por qué el celular "queda de respaldo"?**
Porque el vehículo tiene un GPS instalado funcionando. Para ahorrar batería, el celular solo manda su ubicación cada 2 minutos y se dedica a leer el escáner.
