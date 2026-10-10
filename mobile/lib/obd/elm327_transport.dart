import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_blue_classic/flutter_blue_classic.dart';

/// Canal de comunicación con el ELM327: Bluetooth clásico o WiFi.
abstract class Elm327Transport {
  Stream<String> get input;
  Future<void> write(String data);
  Future<void> close();
  String get description;
}

/// ELM327 Bluetooth (los más comunes). Hay que emparejarlo antes en Ajustes
/// de Android (PIN 1234 o 0000).
class BluetoothTransport implements Elm327Transport {
  BluetoothTransport._(this._connection, this.description);

  final BluetoothConnection _connection;
  @override
  final String description;

  static final FlutterBlueClassic _bt = FlutterBlueClassic();

  static Future<List<BluetoothDevice>> pairedDevices() async {
    return (await _bt.bondedDevices) ?? <BluetoothDevice>[];
  }

  static Future<BluetoothTransport> connect(BluetoothDevice device) async {
    final connection = await _bt.connect(device.address);
    if (connection == null || !connection.isConnected) {
      throw Exception('No se pudo conectar con ${device.name ?? device.address}');
    }
    return BluetoothTransport._(connection, 'Bluetooth ${device.name ?? device.address}');
  }

  @override
  Stream<String> get input => _connection.input!.map((bytes) => latin1.decode(bytes, allowInvalid: true));

  @override
  Future<void> write(String data) async {
    _connection.output.add(Uint8List.fromList(latin1.encode(data)));
    await _connection.output.allSent;
  }

  @override
  Future<void> close() async => _connection.dispose();
}

/// ELM327 WiFi: el celular se conecta a la red "WiFi_OBDII" del escáner.
/// Dirección típica 192.168.0.10, puerto 35000.
class WifiTransport implements Elm327Transport {
  WifiTransport._(this._socket, this.description) : _input = _socket.map((b) => latin1.decode(b, allowInvalid: true)).asBroadcastStream();

  final Socket _socket;
  final Stream<String> _input;
  @override
  final String description;

  static Future<WifiTransport> connect({
    String host = '192.168.0.10',
    int port = 35000,
    Duration timeout = const Duration(seconds: 5),
  }) async {
    final socket = await Socket.connect(host, port, timeout: timeout);
    return WifiTransport._(socket, 'WiFi $host:$port');
  }

  @override
  Stream<String> get input => _input;

  @override
  Future<void> write(String data) async {
    _socket.write(data);
    await _socket.flush();
  }

  @override
  Future<void> close() async => _socket.destroy();
}
