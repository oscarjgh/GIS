import 'dart:async';

import 'elm327_transport.dart';
import 'obd_decoder.dart';

/// Cliente del adaptador ELM327: inicializa, lee PIDs y códigos de falla.
class Elm327 {
  Elm327(this.transport) {
    _sub = transport.input.listen(_onData, onError: (_) => connected = false, onDone: () => connected = false);
  }

  final Elm327Transport transport;
  late final StreamSubscription<String> _sub;
  final StringBuffer _buffer = StringBuffer();
  Completer<String>? _pending;
  Future<void> _lock = Future.value();

  bool connected = true;
  bool isCan = true;
  String protocol = '';
  String version = '';
  final Set<String> _unsupported = {};

  void _onData(String chunk) {
    _buffer.write(chunk);
    // El ELM327 termina cada respuesta con el prompt ">".
    if (chunk.contains('>') && _pending != null && !_pending!.isCompleted) {
      final text = _buffer.toString();
      _buffer.clear();
      _pending!.complete(text);
    }
  }

  /// Envía un comando y espera la respuesta (los comandos se encolan uno por uno).
  Future<String> send(String command, {Duration timeout = const Duration(seconds: 3)}) {
    final result = _lock.then((_) async {
      _buffer.clear();
      _pending = Completer<String>();
      await transport.write('$command\r');
      try {
        return await _pending!.future.timeout(timeout);
      } on TimeoutException {
        return 'TIMEOUT';
      }
    });
    _lock = result.then((_) {}, onError: (_) {});
    return result;
  }

  /// Secuencia de arranque estándar.
  Future<void> initialize() async {
    version = (await send('ATZ', timeout: const Duration(seconds: 5))).replaceAll(RegExp(r'[\r\n>]'), ' ').trim();
    for (final cmd in ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATAT1', 'ATSP0']) {
      await send(cmd);
    }
    // La primera consulta hace que el ELM busque el protocolo del carro (puede tardar).
    final probe = await send('0100', timeout: const Duration(seconds: 15));
    if (isError(probe) || probe == 'TIMEOUT') {
      throw Exception('El escáner no pudo comunicarse con el carro. ¿Está el motor/encendido en ON?');
    }
    final dp = (await send('ATDPN')).replaceAll(RegExp(r'[\r\n> ]'), '').toUpperCase();
    protocol = dp;
    final number = dp.replaceFirst('A', '');
    isCan = ['6', '7', '8', '9'].contains(number);
  }

  /// Lee todos los PIDs soportados. Los que responden "NO DATA" se dejan de pedir.
  Future<Map<String, double>> readLiveData() async {
    final values = <String, double>{};
    for (final spec in standardPids) {
      if (_unsupported.contains(spec.pid)) continue;
      final raw = await send('01${spec.pid}');
      if (raw == 'TIMEOUT') continue;
      final bytes = parseMode01(raw, spec.pid);
      if (bytes == null || bytes.length < spec.bytes) {
        if (isError(raw)) _unsupported.add(spec.pid);
        continue;
      }
      values[spec.key] = double.parse(spec.decode(bytes).toStringAsFixed(2));
    }
    if (!values.containsKey('voltage')) {
      final v = parseVoltage(await send('ATRV'));
      if (v != null) values['voltage'] = v;
    }
    return values;
  }

  Future<List<String>> readDtcs() async {
    final raw = await send('03', timeout: const Duration(seconds: 5));
    if (raw == 'TIMEOUT') throw Exception('Sin respuesta al leer fallas');
    return parseMode03(raw, isCan: isCan);
  }

  /// Borra los códigos y apaga el "check engine" (modo 04).
  Future<bool> clearDtcs() async {
    final raw = await send('04', timeout: const Duration(seconds: 5));
    return cleanLines(raw).any((l) => l.startsWith('44'));
  }

  Future<void> close() async {
    connected = false;
    await _sub.cancel();
    await transport.close();
  }
}
