import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Cola persistente de eventos: si no hay señal, se guardan en el celular
/// y se envían cuando vuelve la conexión.
class OfflineQueue {
  OfflineQueue._(this._file, this._items);

  final File _file;
  final List<Map<String, dynamic>> _items;
  static const maxItems = 20000;

  static Future<OfflineQueue> open() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File('${dir.path}/pending_events.jsonl');
    final items = <Map<String, dynamic>>[];
    if (await file.exists()) {
      for (final line in await file.readAsLines()) {
        if (line.trim().isEmpty) continue;
        try {
          items.add(jsonDecode(line) as Map<String, dynamic>);
        } catch (_) {}
      }
    }
    return OfflineQueue._(file, items);
  }

  int get length => _items.length;

  Future<void> add(Map<String, dynamic> event) async {
    _items.add(event);
    if (_items.length > maxItems) _items.removeRange(0, _items.length - maxItems);
    await _file.writeAsString('${jsonEncode(event)}\n', mode: FileMode.append);
  }

  List<Map<String, dynamic>> peek(int count) => _items.take(count).toList();

  Future<void> removeFirst(int count) async {
    _items.removeRange(0, count.clamp(0, _items.length));
    await _file.writeAsString(_items.map((e) => '${jsonEncode(e)}\n').join());
  }
}
