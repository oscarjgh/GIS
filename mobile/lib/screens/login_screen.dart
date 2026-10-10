import 'package:flutter/material.dart';

import '../api/api_client.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onLoggedIn});
  final ApiClient api;
  final VoidCallback onLoggedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final _server = TextEditingController(text: widget.api.serverUrl);
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.login(_server.text, _email.text, _password.text);
      widget.onLoggedIn();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 40),
            const Icon(Icons.directions_car, size: 64),
            const SizedBox(height: 8),
            Text('Flota OBD', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium),
            const Text('Ingresa con tu usuario de chofer', textAlign: TextAlign.center),
            const SizedBox(height: 32),
            TextField(controller: _server, decoration: const InputDecoration(labelText: 'Servidor', hintText: 'https://mi-servidor.com'), keyboardType: TextInputType.url),
            TextField(controller: _email, decoration: const InputDecoration(labelText: 'Correo'), keyboardType: TextInputType.emailAddress),
            TextField(controller: _password, decoration: const InputDecoration(labelText: 'Contraseña'), obscureText: true, onSubmitted: (_) => _submit()),
            const SizedBox(height: 16),
            if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 16),
            FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Entrando…' : 'Entrar')),
          ],
        ),
      ),
    );
  }
}
