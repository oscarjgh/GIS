import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { FormCard, useTenantBody } from '../components/Form';
import { timeAgo, useApi } from '../hooks';
import { Device, DeviceProtocol, PROTOCOL_LABELS, Vehicle } from '../types';

interface SetupSms {
  simPhone: string | null;
  server: { host: string; port: number };
  messages: { sms: string; description: string }[];
  note: string;
}

const COMMANDS = [
  { type: 'positionSingle', label: '📍 Ubicar ahora' },
  { type: 'engineStop', label: '⛔ Cortar motor', confirm: '¿Seguro que quieres CORTAR el motor? Hazlo solo con el vehículo detenido.' },
  { type: 'engineResume', label: '✅ Restablecer motor' },
  { type: 'positionPeriodic', label: '⏱ Reportar cada 30 s' },
] as const;

interface UnknownDevice {
  uniqueId: string;
  source: string;
  remoteAddress?: string;
  lastSeenAt: string;
}

export function DevicesPage() {
  const { can, user } = useAuth();
  const isSuper = user?.role === 'superadmin';
  const unknown = useApi<UnknownDevice[]>(isSuper ? '/devices/unknown' : null);
  const withTenant = useTenantBody();
  const devices = useApi<Device[]>('/devices');
  const vehicles = useApi<Vehicle[]>('/vehicles');
  const [form, setForm] = useState({ uniqueId: '', protocol: 'tk103_coban' as DeviceProtocol, name: '', simPhone: '', vehicleId: '' });
  const [sms, setSms] = useState<{ device: Device; data: SetupSms } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const vehicleName = (id: string | null) => vehicles.data?.find((v) => v.id === id)?.name ?? '—';

  async function create() {
    await api('/devices', {
      method: 'POST',
      body: withTenant({
        uniqueId: form.uniqueId.trim(),
        protocol: form.protocol,
        name: form.name || undefined,
        simPhone: form.simPhone || undefined,
        vehicleId: form.vehicleId || undefined,
      }),
    });
    setForm({ ...form, uniqueId: '', name: '', simPhone: '' });
    devices.reload();
    unknown.reload();
  }

  async function assign(d: Device, vehicleId: string) {
    await api(`/devices/${d.id}`, { method: 'PATCH', body: { vehicleId: vehicleId || null } });
    devices.reload();
  }

  async function send(d: Device, c: (typeof COMMANDS)[number]) {
    if ('confirm' in c && !confirm(c.confirm)) return;
    try {
      const r = await api<{ status: string; payload: string }>(`/devices/${d.id}/commands`, {
        method: 'POST',
        body: { type: c.type, intervalSec: 30 },
      });
      setMessage(
        r.status === 'sent'
          ? `Comando enviado: ${r.payload}`
          : r.status === 'offline'
            ? 'El GPS no está conectado y el comando no se envió. En equipos Coban puedes usar SMS: stop123456 (cortar) / resume123456 (restablecer).'
            : 'Este dispositivo no acepta comandos.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function showSms(d: Device) {
    setSms({ device: d, data: await api<SetupSms>(`/devices/${d.id}/setup-sms`) });
  }

  return (
    <div className="page">
      <h1>GPS y dispositivos</h1>
      {message && (
        <div className="info" onClick={() => setMessage(null)}>
          {message}
        </div>
      )}
      <table className="card">
        <thead>
          <tr>
            <th>IMEI / ID</th>
            <th>Tipo</th>
            <th>Vehículo</th>
            <th>Conexión</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {devices.data?.map((d) => (
            <tr key={d.id}>
              <td>
                <strong>{d.uniqueId}</strong>
                <div className="muted small">{d.name} {d.simPhone && `· SIM ${d.simPhone}`}</div>
              </td>
              <td>{PROTOCOL_LABELS[d.protocol]}</td>
              <td>
                {can('admin') ? (
                  <select value={d.vehicleId ?? ''} onChange={(e) => assign(d, e.target.value)}>
                    <option value="">— Sin asignar —</option>
                    {vehicles.data?.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                ) : (
                  vehicleName(d.vehicleId)
                )}
              </td>
              <td>
                {d.online ? <span className="ok">● En línea</span> : <span className="muted">○ {timeAgo(d.lastSeenAt)}</span>}
              </td>
              <td className="actions">
                {d.protocol.startsWith('tk103') && (
                  <>
                    {COMMANDS.map((c) => (
                      <button key={c.type} className="small" onClick={() => send(d, c)}>{c.label}</button>
                    ))}
                    {can('admin') && <button className="small secondary" onClick={() => showSms(d)}>✉ SMS de configuración</button>}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sms && (
        <div className="card">
          <div className="row-between">
            <h3>Configurar {sms.device.uniqueId} por SMS</h3>
            <button className="link" onClick={() => setSms(null)}>Cerrar</button>
          </div>
          <p>
            Envía estos mensajes, en orden, al número de la SIM del GPS {sms.data.simPhone && <strong>({sms.data.simPhone})</strong>}.
            Servidor: <code>{sms.data.server.host}:{sms.data.server.port}</code>
          </p>
          <ol>
            {sms.data.messages.map((m) => (
              <li key={m.sms}>
                <code className="copy" onClick={() => navigator.clipboard?.writeText(m.sms)} title="Copiar">{m.sms}</code>{' '}
                <span className="muted">{m.description}</span>
              </li>
            ))}
          </ol>
          <p className="muted">{sms.data.note}</p>
        </div>
      )}

      {isSuper && !!unknown.data?.length && (
        <div className="card">
          <div className="row-between">
            <h3>GPS desconocidos (se conectan pero no están dados de alta)</h3>
            <button className="small secondary" onClick={unknown.reload}>Actualizar</button>
          </div>
          <table>
            <tbody>
              {unknown.data.map((u) => (
                <tr key={u.uniqueId}>
                  <td><strong>{u.uniqueId}</strong></td>
                  <td>{u.source}</td>
                  <td className="muted">{u.remoteAddress}</td>
                  <td>{timeAgo(u.lastSeenAt)}</td>
                  <td>
                    <button
                      className="small"
                      onClick={() =>
                        setForm({ ...form, uniqueId: u.uniqueId, protocol: u.source.startsWith('tk103') ? (u.source as DeviceProtocol) : 'traccar' })
                      }
                    >
                      Usar en el alta ↓
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">El equipo se dará de alta en la empresa seleccionada arriba.</p>
        </div>
      )}

      {can('admin') && (
        <FormCard title="Dar de alta un GPS" onSubmit={create}>
          <label>IMEI (15 dígitos, viene en la etiqueta del GPS)<input value={form.uniqueId} onChange={(e) => setForm({ ...form, uniqueId: e.target.value })} required /></label>
          <label>
            Tipo
            <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value as DeviceProtocol })}>
              <option value="tk103_coban">{PROTOCOL_LABELS.tk103_coban}</option>
              <option value="tk103_xexun">{PROTOCOL_LABELS.tk103_xexun}</option>
              <option value="traccar">{PROTOCOL_LABELS.traccar}</option>
            </select>
          </label>
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Teléfono de la SIM<input value={form.simPhone} onChange={(e) => setForm({ ...form, simPhone: e.target.value })} /></label>
          <label>
            Vehículo
            <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
              <option value="">— Sin asignar —</option>
              {vehicles.data?.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </label>
          <p className="muted small">Las apps móviles se registran solas cuando el chofer inicia sesión y elige su vehículo.</p>
        </FormCard>
      )}
    </div>
  );
}
