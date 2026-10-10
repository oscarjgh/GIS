import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { FormCard, useTenantBody } from '../components/Form';
import { StatusBadge } from '../components/StatusBadge';
import { timeAgo, useApi } from '../hooks';
import { Vehicle } from '../types';

const EMPTY = { name: '', plate: '', brand: '', model: '', year: '', speedLimit: '100' };

export function VehiclesPage() {
  const { can } = useAuth();
  const withTenant = useTenantBody();
  const { data, reload } = useApi<Vehicle[]>('/vehicles');
  const [form, setForm] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function create() {
    await api('/vehicles', {
      method: 'POST',
      body: withTenant({
        name: form.name,
        plate: form.plate || undefined,
        brand: form.brand || undefined,
        model: form.model || undefined,
        year: form.year ? Number(form.year) : undefined,
        speedLimit: Number(form.speedLimit),
      }),
    });
    setForm(EMPTY);
    reload();
  }

  async function remove(v: Vehicle) {
    if (!confirm(`¿Eliminar ${v.name}? Se conserva su historial, pero se desligan sus dispositivos.`)) return;
    await api(`/vehicles/${v.id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div className="page">
      <h1>Vehículos</h1>
      <table className="card">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Placas</th>
            <th>Vehículo</th>
            <th>Estado</th>
            <th>Último reporte</th>
            <th>Fallas</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.map((v) => (
            <tr key={v.id}>
              <td>
                <Link to={`/vehicles/${v.id}`}>{v.name}</Link>
              </td>
              <td>{v.plate}</td>
              <td>{[v.brand, v.model, v.year].filter(Boolean).join(' ')}</td>
              <td>
                <StatusBadge state={v.lastState} />
              </td>
              <td>{timeAgo(v.lastState?.time)}</td>
              <td>{v.lastState?.activeDtcs?.length ? <span className="dtc-chip">{v.lastState.activeDtcs.join(', ')}</span> : '—'}</td>
              <td>{can('admin') && <button className="small danger" onClick={() => remove(v)}>Eliminar</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {can('admin') && (
        <FormCard title="Agregar vehículo" onSubmit={create}>
          <label>Nombre / No. económico<input value={form.name} onChange={set('name')} required /></label>
          <label>Placas<input value={form.plate} onChange={set('plate')} /></label>
          <label>Marca<input value={form.brand} onChange={set('brand')} /></label>
          <label>Modelo<input value={form.model} onChange={set('model')} /></label>
          <label>Año<input type="number" value={form.year} onChange={set('year')} /></label>
          <label>Límite de velocidad (km/h)<input type="number" value={form.speedLimit} onChange={set('speedLimit')} required /></label>
        </FormCard>
      )}
    </div>
  );
}
