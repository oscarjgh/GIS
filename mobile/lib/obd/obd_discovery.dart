import 'package:flutter_blue_classic/flutter_blue_classic.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'elm327.dart';
import 'elm327_transport.dart';

/// Nombres con los que suelen aparecer los ELM327 chinos y sus clones.
final RegExp obdNamePattern =
    RegExp(r'OBD|ELM|V-?LINK|VGATE|KONNWEI|ICAR|VIECAR|CAR ?SCAN|SCAN ?TOOL|OBDLINK|ANCEL|THINKCAR', caseSensitive: false);

/// Busca y conecta el escáner solo, sin que el chofer elija nada:
/// 1) el último escáner que funcionó, 2) Bluetooth emparejados con nombre de OBD, 3) ELM327 WiFi.
class ObdDiscovery {
  static const _lastKey = 'lastObdAddress';

  /// Devuelve un ELM327 ya inicializado, o null si no hay ninguno a la mano.
  static Future<Elm327?> autoConnect({void Function(String step)? onStep}) async {
    final prefs = await SharedPreferences.getInstance();
    final last = prefs.getString(_lastKey);

    final candidates = <BluetoothDevice>[];
    try {
      await [Permission.bluetoothConnect, Permission.bluetoothScan].request();
      final paired = await BluetoothTransport.pairedDevices();
      paired.sort((a, b) {
        // Primero el último que funcionó, luego los que parecen escáner.
        int score(BluetoothDevice d) => d.address == last ? 0 : (obdNamePattern.hasMatch(d.name ?? '') ? 1 : 2);
        return score(a).compareTo(score(b));
      });
      candidates.addAll(paired.where((d) => d.address == last || obdNamePattern.hasMatch(d.name ?? '')));
    } catch (_) {
      // Bluetooth apagado o sin permiso: se intenta WiFi.
    }

    for (final device in candidates) {
      onStep?.call('Probando escáner ${device.name ?? device.address}…');
      final elm = await _tryInit(() => BluetoothTransport.connect(device));
      if (elm != null) {
        await prefs.setString(_lastKey, device.address);
        return elm;
      }
    }

    onStep?.call('Buscando escáner WiFi…');
    return _tryInit(() => WifiTransport.connect(timeout: const Duration(seconds: 2)));
  }

  static Future<Elm327?> _tryInit(Future<Elm327Transport> Function() open) async {
    Elm327? elm;
    try {
      elm = Elm327(await open());
      await elm.initialize();
      return elm;
    } catch (_) {
      await elm?.close();
      return null;
    }
  }
}
