import { useState } from 'react';
import { api } from '../api';
import { FormCard, useTenantBody } from '../components/Form';
import { useApi } from '../hooks';
import { Role, ROLE_LABELS, User } from '../types';

export function UsersPage() {
  const withTenant = useTenantBody();
  const { data, reload } = useApi<User[]>('/users');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'operator' as Role });

  async function create() {
    await api('/users', { method: 'POST', body: withTenant(form) });
    setForm({ name: '', email: '', password: '', role: 'operator' });
    reload();
  }

  async function toggle(u: User) {
    await api(`/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
    reload();
  }

  return (
    <div className="page">
      <h1>Usuarios</h1>
      <table className="card">
        <thead>
          <tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th /></tr>
        </thead>
        <tbody>
          {data?.map((u) => (
            <tr key={u.id} className={u.active ? '' : 'muted'}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{ROLE_LABELS[u.role]}</td>
              <td>{u.active ? 'Activo' : 'Desactivado'}</td>
              <td><button className="small secondary" onClick={() => toggle(u)}>{u.active ? 'Desactivar' : 'Activar'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <FormCard title="Nuevo usuario" onSubmit={create}>
        <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Correo<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Contraseña<input type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <label>
          Rol
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="admin">Administrador (todo)</option>
            <option value="operator">Operador / monitorista (ve y manda comandos)</option>
            <option value="driver">Chofer (solo usa la app móvil)</option>
          </select>
        </label>
      </FormCard>
    </div>
  );
}
