import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;
  @override
  String toString() => message;
}

class Vehicle {
  Vehicle(this.id, this.name, this.plate);
  final String id;
  final String name;
  final String? plate;

  factory Vehicle.fromJson(Map<String, dynamic> j) => Vehicle(j['id'] as String, j['name'] as String, j['plate'] as String?);
}

/// Cliente de la API de la plataforma. Guarda servidor, token, vehículo e id de instalación.
class ApiClient {
  ApiClient._(this._prefs);

  final SharedPreferences _prefs;

  static Future<ApiClient> create() async => ApiClient._(await SharedPreferences.getInstance());

  String get serverUrl => _prefs.getString('serverUrl') ?? 'http://192.168.1.100:3000';
  String? get token => _prefs.getString('token');
  String? get userName => _prefs.getString('userName');
  String? get vehicleId => _prefs.getString('vehicleId');
  String? get vehicleName => _prefs.getString('vehicleName');

  /// Identificador único de esta instalación (así el servidor reconoce el celular).
  String get installationId {
    var id = _prefs.getString('installationId');
    if (id == null) {
      final r = Random.secure();
      id = List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
      _prefs.setString('installationId', id);
    }
    return id;
  }

  Future<void> setVehicle(Vehicle v) async {
    await _prefs.setString('vehicleId', v.id);
    await _prefs.setString('vehicleName', v.name);
  }

  Future<void> setVehicleNull() async {
    await _prefs.remove('vehicleId');
    await _prefs.remove('vehicleName');
  }

  Future<void> login(String server, String email, String password) async {
    final base = server.trim().replaceAll(RegExp(r'/+$'), '');
    final res = await http
        .post(Uri.parse('$base/api/auth/login'),
            headers: {'content-type': 'application/json'}, body: jsonEncode({'email': email.trim(), 'password': password}))
        .timeout(const Duration(seconds: 15));
    final body = _decode(res);
    await _prefs.setString('serverUrl', base);
    await _prefs.setString('token', body['accessToken'] as String);
    await _prefs.setString('userName', (body['user'] as Map)['name'] as String);
  }

  Future<void> logout() async {
    for (final k in ['token', 'userName', 'vehicleId', 'vehicleName']) {
      await _prefs.remove(k);
    }
  }

  Future<List<Vehicle>> vehicles() async {
    final res = await http.get(Uri.parse('$serverUrl/api/vehicles'), headers: _headers()).timeout(const Duration(seconds: 15));
    final list = _decode(res) as List;
    return list.map((e) => Vehicle.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Qué más tiene el vehículo (GPS físico) y cómo recomienda el servidor que trabaje la app.
  Future<Map<String, dynamic>> mobileConfig() async {
    final uri = Uri.parse('$serverUrl/api/ingest/mobile/config').replace(queryParameters: {'vehicleId': vehicleId});
    final res = await http.get(uri, headers: _headers()).timeout(const Duration(seconds: 10));
    return _decode(res) as Map<String, dynamic>;
  }

  /// Envía un lote de eventos. Lanza excepción si falla (para reintentar después).
  Future<void> sendBatch(List<Map<String, dynamic>> events) async {
    final res = await http
        .post(Uri.parse('$serverUrl/api/ingest/mobile'),
            headers: {..._headers(), 'content-type': 'application/json'},
            body: jsonEncode({
              'installationId': installationId,
              'vehicleId': vehicleId,
              'deviceName': 'App de ${userName ?? 'chofer'}',
              'events': events,
            }))
        .timeout(const Duration(seconds: 20));
    _decode(res);
  }

  Map<String, String> _headers() => {if (token != null) 'authorization': 'Bearer $token'};

  dynamic _decode(http.Response res) {
    final body = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 400) {
      final msg = body is Map ? (body['message'] is List ? (body['message'] as List).join(', ') : body['message']) : null;
      throw ApiException(res.statusCode, (msg ?? 'Error ${res.statusCode}').toString());
    }
    return body;
  }
}
