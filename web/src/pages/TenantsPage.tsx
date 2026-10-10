import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { FormCard } from '../components/Form';
import { useApi } from '../hooks';
import { Tenant } from '../types';

export function TenantsPage() {
  const { selectTenant, tenantId } = useAuth();
  const { data, reload } = useApi<Tenant[]>('/tenants');
  const [form, setForm] = useState({ name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function create() {
    await api('/tenants', { method: 'POST', body: form });
    setForm({ name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '' });
    reload();
  }

  async function toggle(t: Tenant) {
    await api(`/tenants/${t.id}`, { method: 'PATCH', body: { active: !t.active } });
    reload();
  }

  return (
    <div className="page">
      <h1>Empresas cliente</h1>
      {!tenantId && <div className="info">Elige una empresa para ver su mapa, vehículos y alertas.</div>}
      <table className="card">
        <thead>
          <tr><th>Empresa</th><th>Slug</th><th>Estado</th><th /></tr>
        </thead>
        <tbody>
          {data?.map((t) => (
            <tr key={t.id} className={t.active ? '' : 'muted'}>
              <td>{t.name}</td>
              <td>{t.slug}</td>
              <td>{t.active ? 'Activa' : 'Suspendida'}</td>
              <td className="actions">
                <button className="small" onClick={() => selectTenant(t.id)} disabled={tenantId === t.id}>
                  {tenantId === t.id ? 'Seleccionada' : 'Entrar'}
                </button>
                <button className="small secondary" onClick={() => toggle(t)}>{t.active ? 'Suspender' : 'Activar'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <FormCard title="Nueva empresa" onSubmit={create}>
        <label>Nombre<input value={form.name} onChange={set('name')} required /></label>
        <label>Slug (para URL)<input value={form.slug} onChange={set('slug')} pattern="[a-z0-9-]{3,40}" required /></label>
        <label>Nombre del administrador<input value={form.adminName} onChange={set('adminName')} required /></label>
        <label>Correo del administrador<input type="email" value={form.adminEmail} onChange={set('adminEmail')} required /></label>
        <label>Contraseña inicial<input type="password" minLength={6} value={form.adminPassword} onChange={set('adminPassword')} required /></label>
      </FormCard>
    </div>
  );
}
