import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/vehicle_screen.dart';
import 'tracking/offline_queue.dart';
import 'tracking/tracking_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = await ApiClient.create();
  final queue = await OfflineQueue.open();
  runApp(FlotaApp(api: api, tracking: TrackingService(api, queue)));
}

class FlotaApp extends StatefulWidget {
  const FlotaApp({super.key, required this.api, required this.tracking});
  final ApiClient api;
  final TrackingService tracking;

  @override
  State<FlotaApp> createState() => _FlotaAppState();
}

class _FlotaAppState extends State<FlotaApp> {
  void _refresh() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final api = widget.api;
    Widget home;
    if (api.token == null) {
      home = LoginScreen(api: api, onLoggedIn: _refresh);
    } else if (api.vehicleId == null) {
      home = VehicleScreen(api: api, onSelected: _refresh, onLogout: _refresh);
    } else {
      home = HomeScreen(
        api: api,
        tracking: widget.tracking,
        onChangeVehicle: () async {
          await widget.tracking.stop();
          await api.setVehicleNull();
          _refresh();
        },
        onLogout: () async {
          await widget.tracking.stop();
          await api.logout();
          _refresh();
        },
      );
    }
    return MaterialApp(
      title: 'Flota OBD',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF2563EB), useMaterial3: true),
      home: home,
    );
  }
}
