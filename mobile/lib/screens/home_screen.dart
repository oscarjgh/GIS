import 'package:flutter/material.dart';
import 'package:flutter_blue_classic/flutter_blue_classic.dart';
import 'package:permission_handler/permission_handler.dart';

import '../api/api_client.dart';
import '../obd/elm327_transport.dart';
import '../tracking/tracking_service.dart';

const _labels = <String, (String, String)>{
  'rpm': ('RPM', ''),
  'speed': ('Velocidad', 'km/h'),
  'coolantTemp': ('Temp. motor', '°C'),
  'intakeTemp': ('Temp. admisión', '°C'),
  'engineLoad': ('Carga', '%'),
  'throttle': ('Acelerador', '%'),
  'fuelLevel': ('Combustible', '%'),
  'voltage': ('Batería', 'V'),
  'maf': ('MAF', 'g/s'),
  'runtimeSec': ('Encendido', 's'),
};

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api, required this.tracking, required this.onChangeVehicle, required this.onLogout});
  final ApiClient api;
  final TrackingService tracking;
  final VoidCallback onChangeVehicle;
  final VoidCallback onLogout;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  ApiClient get api => widget.api;
  TrackingService get tracking => widget.tracking;
  VoidCallback get onChangeVehicle => widget.onChangeVehicle;
  VoidCallback get onLogout => widget.onLogout;

  @override
  void initState() {
    super.initState();
    // Al abrir: detectar qué hay a la mano y configurarse solo.
    WidgetsBinding.instance.addPostFrameCallback((_) => tracking.autoSetup());
  }

  void _snack(BuildContext context, String msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  Future<void> _connectBluetooth(BuildContext context) async {
    await [Permission.bluetoothConnect, Permission.bluetoothScan].request();
    final devices = await BluetoothTransport.pairedDevices();
    if (!context.mounted) return;
    if (devices.isEmpty) {
      _snack(context, 'Empareja primero el ELM327 en Ajustes > Bluetooth (PIN 1234 o 0000)');
      return;
    }
    final device = await showModalBottomSheet<BluetoothDevice>(
      context: context,
      builder: (_) => ListView(
        shrinkWrap: true,
        children: [
          const ListTile(title: Text('Elige tu escáner (suele llamarse OBDII o V-LINK)')),
          for (final d in devices)
            ListTile(leading: const Icon(Icons.bluetooth), title: Text(d.name ?? 'Sin nombre'), subtitle: Text(d.address), onTap: () => Navigator.pop(context, d)),
        ],
      ),
    );
    if (device == null || !context.mounted) return;
    await _connect(context, () => BluetoothTransport.connect(device));
  }

  Future<void> _connect(BuildContext context, Future<Elm327Transport> Function() open) async {
    _snack(context, 'Conectando con el escáner… (puede tardar hasta 15 s)');
    try {
      await tracking.connectObd(await open());
      if (context.mounted) _snack(context, 'Escáner conectado (protocolo ${tracking.elm?.protocol})');
    } catch (e) {
      if (context.mounted) _snack(context, 'Error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: tracking,
      builder: (context, _) {
        final p = tracking.lastPosition;
        return Scaffold(
          appBar: AppBar(
            title: Text(api.vehicleName ?? 'Vehículo'),
            actions: [
              PopupMenuButton<String>(
                onSelected: (v) => v == 'vehicle' ? onChangeVehicle() : onLogout(),
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'vehicle', child: Text('Cambiar de vehículo')),
                  PopupMenuItem(value: 'logout', child: Text('Cerrar sesión')),
                ],
              ),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _DetectionCard(tracking: tracking),
              const SizedBox(height: 8),
              Card(
                child: ListTile(
                  leading: Icon(tracking.tracking ? Icons.gps_fixed : Icons.gps_off, color: tracking.tracking ? Colors.green : Colors.grey),
                  title: Text(tracking.tracking ? 'Rastreo activo' : 'Rastreo detenido'),
                  subtitle: Text(p == null
                      ? 'Sin posición GPS todavía'
                      : '${p.latitude.toStringAsFixed(5)}, ${p.longitude.toStringAsFixed(5)} · ${(p.speed * 3.6).toStringAsFixed(0)} km/h · ±${p.accuracy.toStringAsFixed(0)} m\n'
                          'Pendientes: ${tracking.pending} · Último envío: ${tracking.lastSentAt != null ? TimeOfDay.fromDateTime(tracking.lastSentAt!).format(context) : '—'}'),
                  isThreeLine: p != null,
                ),
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                icon: Icon(tracking.tracking ? Icons.stop : Icons.play_arrow),
                label: Text(tracking.tracking ? 'Detener rastreo' : 'Iniciar rastreo'),
                style: FilledButton.styleFrom(backgroundColor: tracking.tracking ? Colors.red : null, minimumSize: const Size.fromHeight(48)),
                onPressed: () async {
                  try {
                    tracking.tracking ? await tracking.stop() : await tracking.autoSetup();
                  } catch (e) {
                    if (context.mounted) _snack(context, '$e');
                  }
                },
              ),
              const SizedBox(height: 24),
              Row(children: [
                Icon(Icons.car_repair, color: tracking.obdConnected ? Colors.green : Colors.grey),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(tracking.obdConnected ? 'Escáner OBD2 conectado (${tracking.elm!.transport.description})' : 'Escáner OBD2 desconectado',
                      style: Theme.of(context).textTheme.titleMedium),
                ),
                if (tracking.busyObd) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
              ]),
              const SizedBox(height: 8),
              if (!tracking.obdConnected)
                Wrap(spacing: 8, children: [
                  OutlinedButton.icon(icon: const Icon(Icons.bluetooth), label: const Text('ELM327 Bluetooth'), onPressed: () => _connectBluetooth(context)),
                  OutlinedButton.icon(icon: const Icon(Icons.wifi), label: const Text('ELM327 WiFi'), onPressed: () => _connect(context, () => WifiTransport.connect())),
                ])
              else
                TextButton(onPressed: () => tracking.disconnectObd(manual: true), child: const Text('Desconectar escáner')),
              if (tracking.obd.isNotEmpty) ...[
                const SizedBox(height: 8),
                GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  childAspectRatio: 1.4,
                  children: [
                    for (final e in tracking.obd.entries)
                      Card(
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Text('${e.value % 1 == 0 ? e.value.toInt() : e.value.toStringAsFixed(1)} ${_labels[e.key]?.$2 ?? ''}',
                              style: Theme.of(context).textTheme.titleLarge),
                          Text(_labels[e.key]?.$1 ?? e.key, style: Theme.of(context).textTheme.bodySmall),
                        ]),
                      ),
                  ],
                ),
              ],
              if (tracking.obdConnected) ...[
                const SizedBox(height: 16),
                Text('Códigos de falla', style: Theme.of(context).textTheme.titleMedium),
                if (tracking.dtcs.isEmpty) const Text('Sin fallas leídas o sin fallas activas ✓'),
                for (final c in tracking.dtcs) ListTile(dense: true, leading: const Icon(Icons.warning, color: Colors.orange), title: Text(c)),
                Wrap(spacing: 8, children: [
                  OutlinedButton(
                    onPressed: () async {
                      try {
                        final codes = await tracking.readDtcsNow();
                        if (context.mounted) _snack(context, codes.isEmpty ? 'Sin fallas' : '${codes.length} falla(s) encontradas');
                      } catch (e) {
                        if (context.mounted) _snack(context, '$e');
                      }
                    },
                    child: const Text('Leer fallas'),
                  ),
                  OutlinedButton(
                    onPressed: () async {
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (_) => AlertDialog(
                          title: const Text('¿Borrar códigos de falla?'),
                          content: const Text('Se apagará el "check engine". Hazlo solo con el motor apagado y la llave en ON, después de reparar la falla.'),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
                            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Borrar')),
                          ],
                        ),
                      );
                      if (ok != true) return;
                      try {
                        final cleared = await tracking.clearDtcs();
                        if (context.mounted) _snack(context, cleared ? 'Códigos borrados' : 'El vehículo no aceptó el borrado');
                      } catch (e) {
                        if (context.mounted) _snack(context, '$e');
                      }
                    },
                    child: const Text('Borrar fallas'),
                  ),
                ]),
              ],
              if (tracking.lastError != null) ...[
                const SizedBox(height: 16),
                Text(tracking.lastError!, style: const TextStyle(color: Colors.red)),
              ],
            ],
          ),
        );
      },
    );
  }
}

/// Muestra lo que la app detectó y cómo decidió trabajar.
class _DetectionCard extends StatelessWidget {
  const _DetectionCard({required this.tracking});
  final TrackingService tracking;

  Widget _row(BuildContext context, IconData icon, String label, bool ok, String detail) {
    return ListTile(
      dense: true,
      leading: Icon(icon, color: ok ? Colors.green : Colors.grey),
      title: Text(label),
      subtitle: Text(detail),
      trailing: Icon(ok ? Icons.check_circle : Icons.remove_circle_outline, color: ok ? Colors.green : Colors.grey),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = tracking;
    final keys = t.elm?.availableKeys ?? const <String>[];
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ListTile(
            title: const Text('Detección automática'),
            subtitle: Text(t.detecting ? (t.detectStep ?? 'Detectando…') : t.modeDescription),
            trailing: t.detecting
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : IconButton(icon: const Icon(Icons.refresh), tooltip: 'Volver a detectar', onPressed: t.autoSetup),
          ),
          _row(
            context,
            Icons.satellite_alt,
            'GPS del vehículo',
            t.hardwareGpsActive,
            t.hardwareGpsActive
                ? 'Reportando: da la ubicación'
                : t.hardwareGpsRegistered
                    ? 'Instalado pero sin reportar'
                    : 'No tiene',
          ),
          _row(
            context,
            Icons.smartphone,
            'GPS del celular',
            t.phoneGpsAvailable,
            !t.phoneGpsAvailable
                ? 'No disponible (ubicación apagada o sin permiso)'
                : t.locationMode == 'backup'
                    ? 'Respaldo: cada ${t.locationEvery.inSeconds} s'
                    : 'Fuente principal de ubicación',
          ),
          _row(
            context,
            Icons.car_repair,
            'Escáner OBD2',
            t.obdConnected,
            t.obdConnected
                ? 'Lee ${keys.length} datos: ${keys.map((k) => _labels[k]?.$1 ?? k).join(', ')}'
                : t.obdManuallyDisconnected
                    ? 'Desconectado a mano'
                    : 'No encontrado (empareja el ELM327 o conéctate a su WiFi)',
          ),
          if (t.planReason.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
              child: Text(t.planReason, style: Theme.of(context).textTheme.bodySmall),
            ),
        ]),
      ),
    );
  }
}
