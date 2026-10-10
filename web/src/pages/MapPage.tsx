import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { ObdPanel } from '../components/ObdPanel';
import { SourceIcons } from '../components/SourceIcons';
import { StatusBadge } from '../components/StatusBadge';
import { timeAgo, useApi, useRealtime, vehicleStatus } from '../hooks';
import { Alert, Vehicle } from '../types';

const DEFAULT_CENTER: [number, number] = [19.4326, -99.1332];

function FitBounds({ points, focus }: { points: [number, number][]; focus: [number, number] | null }) {
  const map = useMap();
  const [fitted, setFitted] = useState(false);
  useEffect(() => {
    if (!fitted && points.length) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
      setFitted(true);
    }
  }, [points, fitted, map]);
  useEffect(() => {
    if (focus) map.flyTo(focus, Math.max(map.getZoom(), 15));
  }, [focus, map]);
  return null;
}

export function MapPage() {
  const { tenantId } = useAuth();
  const { data: vehicles, setData } = useApi<Vehicle[]>('/vehicles');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [, tick] = useState(0);

  // Refresca los textos "hace X min" cada 30 s.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  useRealtime({
    vehicle: (p: { id: string; tenantId: string; lastState: Vehicle['lastState'] }) => {
      if (p.tenantId !== tenantId) return;
      setData((list) => list?.map((v) => (v.id === p.id ? { ...v, lastState: p.lastState } : v)) ?? list);
    },
    alert: (a: Alert & { tenantId: string }) => {
      if (a.tenantId !== tenantId) return;
      setAlerts((list) => [a, ...list].slice(0, 5));
    },
  });

  const located = useMemo(
    () => (vehicles ?? []).filter((v) => v.lastState?.lat !== undefined && v.lastState?.lng !== undefined),
    [vehicles],
  );
  const points = located.map((v) => [v.lastState!.lat!, v.lastState!.lng!] as [number, number]);

  return (
    <div className="map-page">
      <div className="map-list">
        <h2>Vehículos ({vehicles?.length ?? 0})</h2>
        {vehicles?.map((v) => (
          <div
            key={v.id}
            className="vehicle-row"
            onClick={() => v.lastState?.lat !== undefined && setFocus([v.lastState.lat, v.lastState.lng!])}
          >
            <div className="row-between">
              <strong>
                {v.name} <SourceIcons vehicle={v} />
              </strong>
              <StatusBadge state={v.lastState} />
            </div>
            <div className="muted small">
              {v.plate} · {Math.round(v.lastState?.speed ?? 0)} km/h · {timeAgo(v.lastState?.time)}
            </div>
            {!!v.lastState?.activeDtcs?.length && <div className="dtc-chip">⚠ {v.lastState.activeDtcs.join(', ')}</div>}
          </div>
        ))}
        {vehicles?.length === 0 && <p className="muted">Aún no hay vehículos. Agrégalos en "Vehículos".</p>}
      </div>
      <div className="map-wrap">
        <MapContainer center={DEFAULT_CENTER} zoom={11} className="map">
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitBounds points={points} focus={focus} />
          {located.map((v) => {
            const s = vehicleStatus(v.lastState);
            return (
              <CircleMarker
                key={v.id}
                center={[v.lastState!.lat!, v.lastState!.lng!]}
                radius={10}
                pathOptions={{ color: '#fff', weight: 2, fillColor: s.color, fillOpacity: 1 }}
              >
                <Tooltip direction="top" offset={[0, -8]} permanent>
                  {v.name}
                </Tooltip>
                <Popup minWidth={260}>
                  <strong>{v.name}</strong> {v.plate && <span className="muted">({v.plate})</span>}
                  <div>
                    {s.label} · {Math.round(v.lastState?.speed ?? 0)} km/h · {timeAgo(v.lastState?.time)}
                  </div>
                  <div>
                    <SourceIcons vehicle={v} />
                  </div>
                  <ObdPanel obd={v.lastState?.obd} />
                  <Link to={`/vehicles/${v.id}`}>Ver detalle, recorrido y fallas →</Link>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
        {alerts.length > 0 && (
          <div className="toasts">
            {alerts.map((a) => (
              <div key={a.id} className={`toast ${a.severity}`} onClick={() => a.lat !== null && setFocus([a.lat, a.lng!])}>
                {a.message}
                <button className="link" onClick={(e) => (e.stopPropagation(), setAlerts((l) => l.filter((x) => x.id !== a.id)))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
