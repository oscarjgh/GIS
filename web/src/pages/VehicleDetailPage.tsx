import { useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import { Link, useParams } from 'react-router-dom';
import { ObdPanel } from '../components/ObdPanel';
import { SourcesCard } from '../components/SourceIcons';
import { StatusBadge } from '../components/StatusBadge';
import { timeAgo, useApi } from '../hooks';
import { Alert, Device, Position, PROTOCOL_LABELS, Vehicle } from '../types';

interface DtcResponse {
  active: { code: string; description: string }[];
  history: { id: string; time: string; code: string; description: string; status: 'detected' | 'cleared' }[];
}

function toLocalInput(d: Date) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function VehicleDetailPage() {
  const { id } = useParams();
  const [from, setFrom] = useState(toLocalInput(new Date(Date.now() - 24 * 3600 * 1000)));
  const [to, setTo] = useState(toLocalInput(new Date()));
  const range = useMemo(() => ({ from: new Date(from).toISOString(), to: new Date(to).toISOString() }), [from, to]);

  const vehicle = useApi<Vehicle & { devices: Device[] }>(`/vehicles/${id}`);
  const route = useApi<Position[]>(`/vehicles/${id}/positions`, range);
  const dtc = useApi<DtcResponse>(`/vehicles/${id}/dtc`);
  const alerts = useApi<Alert[]>('/alerts', { vehicleId: id });

  const v = vehicle.data;
  if (!v) return <div className="page">{vehicle.error ?? 'Cargando…'}</div>;
  const line = (route.data ?? []).map((p) => [p.lat, p.lng] as [number, number]);
  const maxSpeed = Math.max(0, ...(route.data ?? []).map((p) => p.speed));
  const center: [number, number] = line[line.length - 1] ?? (v.lastState?.lat !== undefined ? [v.lastState.lat, v.lastState.lng!] : [19.4326, -99.1332]);

  return (
    <div className="page">
      <Link to="/vehicles">← Vehículos</Link>
      <div className="row-between">
        <h1>
          {v.name} <span className="muted">{v.plate}</span>
        </h1>
        <StatusBadge state={v.lastState} />
      </div>
      <p className="muted">
        {[v.brand, v.model, v.year].filter(Boolean).join(' ')} · Odómetro {v.odometerKm.toFixed(1)} km · Último reporte{' '}
        {timeAgo(v.lastState?.time)} · Dispositivos:{' '}
        {v.devices.map((d) => `${d.name ?? d.uniqueId} (${PROTOCOL_LABELS[d.protocol]})`).join(', ') || 'ninguno'}
      </p>

      <SourcesCard vehicle={v} />

      <div className="grid-2">
        <section className="card">
          <h3>Datos del motor (OBD2)</h3>
          <ObdPanel obd={v.lastState?.obd} />
        </section>
        <section className="card">
          <h3>Códigos de falla</h3>
          {dtc.data?.active.length ? (
            <ul className="dtc-list">
              {dtc.data.active.map((d) => (
                <li key={d.code}>
                  <strong>{d.code}</strong> {d.description}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ok">✓ Sin fallas activas</p>
          )}
          {!!dtc.data?.history.length && (
            <details>
              <summary>Historial ({dtc.data.history.length})</summary>
              <table>
                <tbody>
                  {dtc.data.history.map((h) => (
                    <tr key={h.id}>
                      <td>{new Date(h.time).toLocaleString()}</td>
                      <td>{h.code}</td>
                      <td>{h.status === 'detected' ? '⚠ Detectada' : '✓ Borrada'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </section>
      </div>

      <section className="card">
        <div className="row-between wrap">
          <h3>Recorrido</h3>
          <div className="row">
            <label>
              Desde <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              Hasta <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        </div>
        <p className="muted">
          {line.length} puntos · velocidad máxima {Math.round(maxSpeed)} km/h
        </p>
        <MapContainer key={`${center[0]},${center[1]}`} center={center} zoom={13} className="map small-map">
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#2563eb', weight: 4 }} />}
          {line.length > 0 && (
            <>
              <CircleMarker center={line[0]} radius={7} pathOptions={{ color: '#16a34a', fillOpacity: 1 }}>
                <Tooltip>Inicio</Tooltip>
              </CircleMarker>
              <CircleMarker center={line[line.length - 1]} radius={7} pathOptions={{ color: '#dc2626', fillOpacity: 1 }}>
                <Tooltip>Fin</Tooltip>
              </CircleMarker>
            </>
          )}
        </MapContainer>
      </section>

      <section className="card">
        <h3>Alertas recientes</h3>
        <AlertTable alerts={alerts.data ?? []} />
      </section>
    </div>
  );
}

export function AlertTable({ alerts, onAck }: { alerts: Alert[]; onAck?: (a: Alert) => void }) {
  if (!alerts.length) return <p className="muted">Sin alertas.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Nivel</th>
          <th>Mensaje</th>
          {onAck && <th />}
        </tr>
      </thead>
      <tbody>
        {alerts.map((a) => (
          <tr key={a.id} className={a.acknowledged ? 'muted' : ''}>
            <td>{new Date(a.time).toLocaleString()}</td>
            <td>
              <span className={`sev ${a.severity}`}>{a.severity === 'critical' ? 'Crítica' : a.severity === 'warning' ? 'Aviso' : 'Info'}</span>
            </td>
            <td>{a.message}</td>
            {onAck && <td>{!a.acknowledged && <button className="small" onClick={() => onAck(a)}>Atendida</button>}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
