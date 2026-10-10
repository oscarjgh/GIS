import { useState } from 'react';
import { Circle, MapContainer, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';
import { api } from '../api';
import { useAuth } from '../auth';
import { FormCard, useTenantBody } from '../components/Form';
import { useApi } from '../hooks';
import { Geofence } from '../types';

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export function GeofencesPage() {
  const { can } = useAuth();
  const withTenant = useTenantBody();
  const { data, reload } = useApi<Geofence[]>('/geofences');
  const [draft, setDraft] = useState({ name: '', lat: 0, lng: 0, radiusMeters: 300 });
  const editable = can('admin', 'operator');

  async function create() {
    if (!draft.lat) throw new Error('Haz clic en el mapa para elegir el centro');
    await api('/geofences', { method: 'POST', body: withTenant(draft) });
    setDraft({ name: '', lat: 0, lng: 0, radiusMeters: 300 });
    reload();
  }

  async function remove(g: Geofence) {
    if (!confirm(`¿Eliminar la geocerca "${g.name}"?`)) return;
    await api(`/geofences/${g.id}`, { method: 'DELETE' });
    reload();
  }

  const first = data?.[0];
  return (
    <div className="page">
      <h1>Geocercas</h1>
      <p className="muted">Avisan cuando un vehículo entra o sale de una zona (bodega, cliente, zona de riesgo).</p>
      <MapContainer center={first ? [first.lat, first.lng] : [19.4326, -99.1332]} zoom={12} className="map small-map">
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {editable && <ClickToPlace onPick={(lat, lng) => setDraft((d) => ({ ...d, lat, lng }))} />}
        {data?.map((g) => (
          <Circle key={g.id} center={[g.lat, g.lng]} radius={g.radiusMeters} pathOptions={{ color: '#2563eb' }}>
            <Tooltip>{g.name}</Tooltip>
          </Circle>
        ))}
        {draft.lat !== 0 && <Circle center={[draft.lat, draft.lng]} radius={draft.radiusMeters} pathOptions={{ color: '#f59e0b', dashArray: '6' }} />}
      </MapContainer>
      {editable && (
        <FormCard title="Nueva geocerca (haz clic en el mapa)" onSubmit={create}>
          <label>Nombre<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></label>
          <label>Radio (metros)<input type="number" min={20} value={draft.radiusMeters} onChange={(e) => setDraft({ ...draft, radiusMeters: Number(e.target.value) })} /></label>
          <label>Centro<input readOnly value={draft.lat ? `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}` : 'clic en el mapa'} /></label>
        </FormCard>
      )}
      <table className="card">
        <tbody>
          {data?.map((g) => (
            <tr key={g.id}>
              <td>{g.name}</td>
              <td>{g.radiusMeters} m</td>
              <td>{editable && <button className="small danger" onClick={() => remove(g)}>Eliminar</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
