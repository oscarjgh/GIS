import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../api/api_client.dart';
import '../obd/elm327.dart';
import '../obd/elm327_transport.dart';
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
      lastError = null;
    } catch (e) {
      await client.close();
      lastError = e.toString();
      rethrow;
    } finally {
      notifyListeners();
    }
  }

  Future<void> disconnectObd() async {
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

  // ------------------------------------------------------------- Rastreo

  Future<void> start() async {
    if (tracking) return;
    await _ensureLocationPermission();
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
      notifyListeners();
    }, onError: (e) {
      lastError = 'GPS: $e';
      notifyListeners();
    });
    _sampleTimer = Timer.periodic(sampleEvery, (_) => _sample());
    _flushTimer = Timer.periodic(flushEvery, (_) => flush());
    tracking = true;
    WakelockPlus.enable();
    notifyListeners();
  }

  Future<void> stop() async {
    await _gps?.cancel();
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
    final p = lastPosition;
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
