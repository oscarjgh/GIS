import 'package:flutter/material.dart';

import '../api/api_client.dart';

/// El chofer elige qué vehículo maneja hoy.
class VehicleScreen extends StatefulWidget {
  const VehicleScreen({super.key, required this.api, required this.onSelected, required this.onLogout});
  final ApiClient api;
  final VoidCallback onSelected;
  final VoidCallback onLogout;

  @override
  State<VehicleScreen> createState() => _VehicleScreenState();
}

class _VehicleScreenState extends State<VehicleScreen> {
  late Future<List<Vehicle>> _future = widget.api.vehicles();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('¿Qué vehículo manejas?'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await widget.api.logout();
              widget.onLogout();
            },
          ),
        ],
      ),
      body: FutureBuilder<List<Vehicle>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) {
            return Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('${snap.error}'),
                TextButton(onPressed: () => setState(() => _future = widget.api.vehicles()), child: const Text('Reintentar')),
              ]),
            );
          }
          final list = snap.data!;
          if (list.isEmpty) return const Center(child: Text('Tu empresa aún no tiene vehículos registrados.'));
          return ListView.separated(
            itemCount: list.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, i) => ListTile(
              leading: const Icon(Icons.local_shipping),
              title: Text(list[i].name),
              subtitle: list[i].plate != null ? Text(list[i].plate!) : null,
              onTap: () async {
                await widget.api.setVehicle(list[i]);
                widget.onSelected();
              },
            ),
          );
        },
      ),
    );
  }
}
