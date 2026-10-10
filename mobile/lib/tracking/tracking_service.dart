import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../api/api_client.dart';
import '../obd/elm327.dart';
import '../obd/elm327_transport.dart';
import '../obd/obd_discovery.dart';
import 'offline_queue.dart';

/// Corazón de la app: junta GPS + OBD2 cada cierto tiempo, lo encola y lo envía.
class TrackingService extends ChangeNotifier {
  TrackingService(this.api, this.queue);

  final ApiClient api;
  final OfflineQueue queue;

  Elm327? elm;
  bool tracking = false;
  String? lastError;
  Position? lastPosition;
  Map<String, double> obd = {};
  List<String> dtcs = [];
  DateTime? lastSentAt;
  bool busyObd = false;

  Duration sampleEvery = const Duration(seconds: 10);
  Duration dtcEvery = const Duration(minutes: 2);
  Duration flushEvery = const Duration(seconds: 15);

  // ------------------------------------------------ Detección automática
  /// Lo que el servidor sabe del vehículo (GPS físico) y su recomendación.
  bool hardwareGpsRegistered = false;
  bool hardwareGpsActive = false;
  /// 'full' = el celular manda ubicación siempre; 'backup' = solo de respaldo (hay GPS físico).
  String locationMode = 'full';
  Duration locationEvery = const Duration(seconds: 10);
  String planReason = '';
  bool phoneGpsAvailable = false;
  bool detecting = false;
  /// Si el chofer desconectó el escáner a mano, la detección automática no lo reconecta.
  bool obdManuallyDisconnected = false;
  String? detectStep;
  DateTime? _lastLocationQueued;
  Timer? _redetectTimer;

  StreamSubscription<Position>? _gps;
  Timer? _sampleTimer;
  Timer? _flushTimer;
  DateTime _lastDtcRead = DateTime.fromMillisecondsSinceEpoch(0);
  bool _sampling = false;
  bool _flushing = false;

  bool get obdConnected => elm?.connected ?? false;
  int get pending => queue.length;

  // ------------------------------------------------------------- ELM327

  Future<void> connectObd(Elm327Transport transport) async {
    await disconnectObd();
    final client = Elm327(transport);
    try {
      await client.initialize();
      elm = client;
      obdManuallyDisconnected = false;
      lastError = null;
    } catch (e) {
      await client.close();
      lastError = e.toString();
      rethrow;
    } finally {
      notifyListeners();
    }
  }

  Future<void> disconnectObd({bool manual = false}) async {
    if (manual) obdManuallyDisconnected = true;
    await elm?.close();
    elm = null;
    notifyListeners();
  }

  Future<List<String>> readDtcsNow() async {
    final client = elm;
    if (client == null) throw Exception('Conecta primero el escáner');
    dtcs = await client.readDtcs();
    _lastDtcRead = DateTime.now();
    await _enqueue(dtcsOverride: dtcs);
    notifyListeners();
    return dtcs;
  }

  Future<bool> clearDtcs() async {
    final client = elm;
    if (client == null) throw Exception('Conecta primero el escáner');
    final ok = await client.clearDtcs();
    if (ok) await readDtcsNow();
    return ok;
  }

  // ------------------------------------------------- Autoconfiguración

  /// Detecta qué hay a la mano (GPS físico del vehículo, GPS del celular, escáner)
  /// y configura la app para leer solo eso. Se repite cada 2 minutos.
  Future<void> autoSetup() async {
    if (detecting) return;
    detecting = true;
    notifyListeners();
    try {
      detectStep = 'Consultando el vehículo en el servidor…';
      notifyListeners();
      await _refreshPlan();

      if (!tracking) {
        detectStep = 'Activando GPS del celular…';
        notifyListeners();
        await start();
      } else if (_gps == null) {
        // Quizá el chofer encendió la ubicación después: se reintenta sin volver a pedir permiso.
        await _retryGpsSilently();
      }

      if (!obdConnected && !obdManuallyDisconnected) {
        final found = await ObdDiscovery.autoConnect(onStep: (step) {
          detectStep = step;
          notifyListeners();
        });
        if (found != null) {
          await elm?.close();
          elm = found;
        }
      }
    } finally {
      detecting = false;
      detectStep = null;
      _redetectTimer ??= Timer.periodic(const Duration(minutes: 2), (_) => autoSetup());
      notifyListeners();
    }
  }

  Future<void> _refreshPlan() async {
    try {
      final cfg = await api.mobileConfig();
      final gps = (cfg['sources'] as Map)['gps'] as Map;
      final plan = cfg['plan'] as Map;
      hardwareGpsRegistered = gps['registered'] == true;
      hardwareGpsActive = gps['active'] == true;
      locationMode = plan['location'] as String;
      locationEvery = Duration(seconds: (plan['locationEverySec'] as num).toInt());
      planReason = plan['reason'] as String;
      final newSample = Duration(seconds: (plan['sampleEverySec'] as num).toInt());
      dtcEvery = Duration(seconds: (plan['dtcEverySec'] as num).toInt());
      if (newSample != sampleEvery) {
        sampleEvery = newSample;
        if (tracking) {
          _sampleTimer?.cancel();
          _sampleTimer = Timer.periodic(sampleEvery, (_) => _sample());
        }
      }
    } catch (_) {
      // Sin conexión: se conserva el último plan (por defecto el celular manda ubicación).
    }
  }

  Future<void> _retryGpsSilently() async {
    final perm = await Geolocator.checkPermission();
    if (await Geolocator.isLocationServiceEnabled() &&
        (perm == LocationPermission.always || perm == LocationPermission.whileInUse)) {
      _startGps();
    }
  }

  /// Resumen en palabras de cómo está trabajando la app.
  String get modeDescription {
    final scanner = obdConnected;
    if (hardwareGpsActive && scanner) return 'GPS del vehículo + escáner: el celular solo lee el motor.';
    if (hardwareGpsActive) return 'El GPS del vehículo da la ubicación; el celular queda de respaldo.';
    if (phoneGpsAvailable && scanner) return 'Celular como GPS + escáner leyendo el motor.';
    if (phoneGpsAvailable) return 'Solo celular: se envía la ubicación (sin datos del motor).';
    if (scanner) return 'Solo escáner: se envían datos del motor sin ubicación.';
    return 'Nada disponible todavía.';
  }

  // ------------------------------------------------------------- Rastreo

  /// Arranca el envío. Si el GPS del celular no está disponible (apagado o sin
  /// permiso) sigue trabajando solo con el escáner.
  Future<void> start() async {
    if (tracking) return;
    try {
      await _ensureLocationPermission();
      _startGps();
    } catch (e) {
      phoneGpsAvailable = false;
      lastError = '$e (se sigue enviando lo demás)';
    }
    _sampleTimer = Timer.periodic(sampleEvery, (_) => _sample());
    _flushTimer = Timer.periodic(flushEvery, (_) => flush());
    tracking = true;
    WakelockPlus.enable();
    notifyListeners();
  }

  void _startGps() {
    final settings = defaultTargetPlatform == TargetPlatform.android
        ? AndroidSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 0,
            intervalDuration: const Duration(seconds: 5),
            // Servicio en primer plano: Android no mata la app con la pantalla apagada.
            foregroundNotificationConfig: const ForegroundNotificationConfig(
              notificationTitle: 'Flota OBD activo',
              notificationText: 'Enviando ubicación y datos del vehículo',
              enableWakeLock: true,
            ),
          )
        : AppleSettings(
            accuracy: LocationAccuracy.high,
            activityType: ActivityType.automotiveNavigation,
            pauseLocationUpdatesAutomatically: false,
            showBackgroundLocationIndicator: true,
          );
    _gps = Geolocator.getPositionStream(locationSettings: settings).listen((p) {
      lastPosition = p;
      phoneGpsAvailable = true;
      notifyListeners();
    }, onError: (e) {
      phoneGpsAvailable = false;
      lastError = 'GPS: $e';
      notifyListeners();
    });
  }

  Future<void> stop() async {
    _redetectTimer?.cancel();
    _redetectTimer = null;
    phoneGpsAvailable = false;
    await _gps?.cancel();
    _gps = null;
    _sampleTimer?.cancel();
    _flushTimer?.cancel();
    tracking = false;
    WakelockPlus.disable();
    await flush();
    notifyListeners();
  }

  Future<void> _sample() async {
    if (_sampling) return;
    _sampling = true;
    try {
      List<String>? readDtcs;
      final client = elm;
      if (client != null && client.connected) {
        busyObd = true;
        notifyListeners();
        try {
          obd = await client.readLiveData();
          if (DateTime.now().difference(_lastDtcRead) >= dtcEvery) {
            readDtcs = await client.readDtcs();
            dtcs = readDtcs;
            _lastDtcRead = DateTime.now();
          }
        } catch (e) {
          lastError = 'OBD: $e';
        } finally {
          busyObd = false;
        }
      }
      await _enqueue(dtcsOverride: readDtcs);
    } finally {
      _sampling = false;
      notifyListeners();
    }
  }

  Future<void> _enqueue({List<String>? dtcsOverride}) async {
    // Con GPS físico activo, la ubicación del celular solo se manda de vez en cuando (respaldo).
    final now = DateTime.now();
    final locationDue = locationMode == 'full' ||
        _lastLocationQueued == null ||
        now.difference(_lastLocationQueued!) >= locationEvery;
    final p = locationDue ? lastPosition : null;
    if (p != null) _lastLocationQueued = now;
    final hasObd = elm?.connected == true && obd.isNotEmpty;
    if (p == null && !hasObd && dtcsOverride == null) return;
    final event = <String, dynamic>{
      'time': DateTime.now().toUtc().toIso8601String(),
      if (p != null) ...{
        'lat': p.latitude,
        'lng': p.longitude,
        'speed': (p.speed * 3.6).clamp(0, 400), // m/s -> km/h
        if (p.heading.isFinite && p.heading >= 0) 'course': p.heading,
        'altitude': p.altitude,
        'accuracy': p.accuracy,
      },
      if (hasObd) 'obd': obd,
      if (hasObd && obd['rpm'] != null) 'ignition': obd['rpm']! > 0,
      if (dtcsOverride != null) 'dtcs': dtcsOverride,
    };
    // Si el OBD da velocidad, es más exacta que la del GPS.
    if (hasObd && obd['speed'] != null) event['speed'] = obd['speed'];
    await queue.add(event);
  }

  /// Envía lo pendiente en lotes de 200.
  Future<void> flush() async {
    if (_flushing || api.vehicleId == null) return;
    _flushing = true;
    try {
      while (queue.length > 0) {
        final batch = queue.peek(200);
        await api.sendBatch(batch);
        await queue.removeFirst(batch.length);
        lastSentAt = DateTime.now();
        lastError = null;
      }
    } on ApiException catch (e) {
      lastError = 'Servidor: ${e.message}';
      // Un 400 significa datos inválidos: se descartan para no bloquear la cola.
      if (e.status == 400) await queue.removeFirst(queue.peek(200).length);
    } catch (e) {
      lastError = 'Sin conexión, ${queue.length} pendientes';
    } finally {
      _flushing = false;
      notifyListeners();
    }
  }

  Future<void> _ensureLocationPermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw Exception('Activa la ubicación (GPS) del celular');
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      throw Exception('La app necesita permiso de ubicación');
    }
  }

  @override
  void dispose() {
    stop();
    elm?.close();
    super.dispose();
  }
}
