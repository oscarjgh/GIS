// Decodificación de respuestas OBD2 (modo 01 y modo 03) sin dependencias,
// para poder probarla aparte.

class PidSpec {
  const PidSpec(this.pid, this.key, this.bytes, this.decode);
  final String pid;
  final String key;
  final int bytes;
  final double Function(List<int> b) decode;
}

/// PIDs estándar que lee la app. La clave coincide con la del backend.
final List<PidSpec> standardPids = [
  PidSpec('0C', 'rpm', 2, (b) => ((b[0] * 256) + b[1]) / 4),
  PidSpec('0D', 'speed', 1, (b) => b[0].toDouble()),
  PidSpec('05', 'coolantTemp', 1, (b) => b[0] - 40),
  PidSpec('0F', 'intakeTemp', 1, (b) => b[0] - 40),
  PidSpec('04', 'engineLoad', 1, (b) => b[0] * 100 / 255),
  PidSpec('11', 'throttle', 1, (b) => b[0] * 100 / 255),
  PidSpec('2F', 'fuelLevel', 1, (b) => b[0] * 100 / 255),
  PidSpec('10', 'maf', 2, (b) => ((b[0] * 256) + b[1]) / 100),
  PidSpec('1F', 'runtimeSec', 2, (b) => ((b[0] * 256) + b[1]).toDouble()),
  PidSpec('42', 'voltage', 2, (b) => ((b[0] * 256) + b[1]) / 1000),
];

/// Limpia la respuesta del ELM327: quita eco, "SEARCHING...", prompt, espacios.
List<String> cleanLines(String raw) {
  return raw
      .replaceAll('>', '')
      .split(RegExp(r'[\r\n]+'))
      .map((l) => l.trim().replaceAll(' ', '').toUpperCase())
      .where((l) => l.isNotEmpty && !l.startsWith('SEARCHING') && !l.startsWith('BUSINIT'))
      .toList();
}

bool isError(String raw) {
  final r = raw.toUpperCase();
  return r.contains('NODATA') ||
      r.contains('NO DATA') ||
      r.contains('UNABLE') ||
      r.contains('ERROR') ||
      r.contains('STOPPED') ||
      r.contains('?');
}

/// Extrae los bytes de datos de una respuesta de modo 01. Ej. "410C1AF8" -> [0x1A, 0xF8].
List<int>? parseMode01(String raw, String pid) {
  final prefix = '41$pid';
  for (final line in cleanLines(raw)) {
    final idx = line.indexOf(prefix);
    if (idx < 0) continue;
    final data = line.substring(idx + prefix.length);
    final bytes = <int>[];
    for (var i = 0; i + 1 < data.length; i += 2) {
      final v = int.tryParse(data.substring(i, i + 2), radix: 16);
      if (v == null) break;
      bytes.add(v);
    }
    return bytes;
  }
  return null;
}

/// Decodifica un par de bytes a código DTC. Ej. 0x01 0x33 -> P0133.
String decodeDtc(int a, int b) {
  const letters = ['P', 'C', 'B', 'U'];
  final letter = letters[(a >> 6) & 0x03];
  final d1 = (a >> 4) & 0x03;
  final d2 = (a & 0x0F).toRadixString(16);
  final rest = b.toRadixString(16).padLeft(2, '0');
  return '$letter$d1$d2$rest'.toUpperCase();
}

/// Decodifica la respuesta del modo 03 (códigos de falla guardados).
/// [isCan]: en CAN el primer byte después de "43" es la cantidad de códigos.
List<String> parseMode03(String raw, {required bool isCan}) {
  if (raw.toUpperCase().contains('NODATA')) return [];
  final lines = cleanLines(raw)
      // Respuestas multi-trama CAN: "0:43..." "1:..."; la primera línea puede ser la longitud ("00A").
      .map((l) => l.replaceFirst(RegExp(r'^[0-9A-F]:'), ''))
      .where((l) => !RegExp(r'^[0-9A-F]{3}$').hasMatch(l))
      .toList();

  final codes = <String>{};
  if (isCan) {
    final joined = lines.join();
    var idx = joined.indexOf('43');
    while (idx >= 0) {
      final hex = joined.substring(idx + 2);
      final count = int.tryParse(hex.length >= 2 ? hex.substring(0, 2) : '', radix: 16) ?? 0;
      for (var i = 0; i < count; i++) {
        final start = 2 + i * 4;
        if (start + 4 > hex.length) break;
        final a = int.parse(hex.substring(start, start + 2), radix: 16);
        final b = int.parse(hex.substring(start + 2, start + 4), radix: 16);
        if (a != 0 || b != 0) codes.add(decodeDtc(a, b));
      }
      // Otras ECU (motor + transmisión) pueden responder en el mismo mensaje.
      final next = joined.indexOf('43', idx + 2 + 2 + count * 4);
      idx = next;
    }
  } else {
    // Protocolos antiguos: cada línea "43" + 3 códigos de 2 bytes (relleno con 0000).
    for (final line in lines) {
      if (!line.startsWith('43')) continue;
      final hex = line.substring(2);
      for (var i = 0; i + 4 <= hex.length; i += 4) {
        final a = int.parse(hex.substring(i, i + 2), radix: 16);
        final b = int.parse(hex.substring(i + 2, i + 4), radix: 16);
        if (a != 0 || b != 0) codes.add(decodeDtc(a, b));
      }
    }
  }
  return codes.toList()..sort();
}

/// "12.6V" -> 12.6
double? parseVoltage(String raw) {
  final m = RegExp(r'(\d+(\.\d+)?)V').firstMatch(raw.toUpperCase());
  return m == null ? null : double.tryParse(m.group(1)!);
}

/// Decodifica la máscara de PIDs soportados (respuestas a 0100, 0120, 0140…).
/// Ej. "4100BE1FA813" con base 0x00 -> {01, 03, 04, 05, 06, 07, 0C, 0D, …}.
/// Si responden varias ECU se combinan sus máscaras.
Set<String> parseSupportedPids(String raw, int base) {
  final prefix = '41${base.toRadixString(16).padLeft(2, '0').toUpperCase()}';
  final supported = <String>{};
  for (final line in cleanLines(raw)) {
    final idx = line.indexOf(prefix);
    if (idx < 0 || line.length < idx + prefix.length + 8) continue;
    final mask = int.tryParse(line.substring(idx + prefix.length, idx + prefix.length + 8), radix: 16);
    if (mask == null) continue;
    for (var i = 0; i < 32; i++) {
      if (mask & (1 << (31 - i)) != 0) {
        supported.add((base + i + 1).toRadixString(16).padLeft(2, '0').toUpperCase());
      }
    }
  }
  return supported;
}
