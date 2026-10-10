# App móvil (Flutter) – Etapa 1

App del chofer: lee el escáner **OBD2 ELM327** (Bluetooth o WiFi) y el **GPS del celular**, y envía todo a la plataforma. Si no hay señal, guarda los datos y los manda cuando vuelve la conexión.

> Esta carpeta trae solo el código Dart (`lib/`) y `pubspec.yaml`. Las carpetas nativas `android/` e `ios/` se generan con Flutter (paso 2).

## Puesta en marcha

1. Instala Flutter 3.22 o superior: https://docs.flutter.dev/get-started/install
2. Genera las carpetas nativas (no sobrescribe `lib/`):
   ```bash
   cd mobile
   flutter create --org com.tuempresa --project-name flota_obd --platforms=android,ios .
   flutter pub get
   ```
3. Agrega los permisos en `android/app/src/main/AndroidManifest.xml`, dentro de `<manifest>`:
   ```xml
   <uses-permission android:name="android.permission.INTERNET"/>
   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
   <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
   <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
   <uses-permission android:name="android.permission.WAKE_LOCK"/>
   <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30"/>
   <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30"/>
   <uses-permission android:name="android.permission.BLUETOOTH_CONNECT"/>
   <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation"/>
   ```
   Si el servidor de pruebas usa `http://` (no `https://`), agrega `android:usesCleartextTraffic="true"` a la etiqueta `<application>`.
   En `android/app/build.gradle` usa `minSdkVersion 23` o mayor.
4. Conecta un Android y ejecuta `flutter run`.

## Uso

1. Empareja el ELM327 en *Ajustes > Bluetooth* (PIN `1234` o `0000`). Con el modelo WiFi, conéctate a su red `WiFi_OBDII`.
2. En la app, inicia sesión con un usuario de rol **Chofer** creado en la web y elige el vehículo.
3. **Iniciar rastreo** manda la ubicación cada 10 s (sigue funcionando con la pantalla apagada).
4. **ELM327 Bluetooth/WiFi** conecta el escáner. A partir de ahí se envían RPM, temperatura, voltaje, etc., y cada 2 minutos se leen los códigos de falla.

## Notas sobre el ELM327 chino

- Bluetooth clásico (SPP): funciona en **Android**. En iPhone solo funcionan los modelos **WiFi** o **BLE** (BLE no está implementado aún).
- Muchos clones "v2.1" fallan. Los que mejor funcionan tienen el chip **PIC18F25K80** ("v1.5").
- Solo se leen PIDs estándar (modo 01) y fallas genéricas (modo 03/04). Los datos propios de cada marca (ABS, bolsas de aire, TPMS) requieren comandos del fabricante.

## Estructura

```
lib/
├── main.dart                     Navegación: login → elegir vehículo → inicio
├── api/api_client.dart           Login, vehículos, envío de lotes a /api/ingest/mobile
├── obd/elm327_transport.dart     Conexión Bluetooth clásico / WiFi
├── obd/elm327.dart               Inicialización AT, lectura de PIDs y DTC, borrado
├── obd/obd_decoder.dart          Decodificación pura de respuestas OBD2
├── tracking/tracking_service.dart  Junta GPS + OBD, encola y envía
├── tracking/offline_queue.dart   Cola persistente sin señal
└── screens/                      Pantallas
```
