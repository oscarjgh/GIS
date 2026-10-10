import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { ROLE_LABELS, Tenant } from '../types';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, can, tenantId, selectTenant } = useAuth();
  const isSuper = user?.role === 'superadmin';
  const tenants = useApi<Tenant[]>(isSuper ? '/tenants' : null);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">🚗 Flota GPS</div>
        {isSuper && (
          <select className="tenant-select" value={tenantId ?? ''} onChange={(e) => selectTenant(e.target.value || null)}>
            <option value="">— Elige empresa —</option>
            {tenants.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <nav>
          {tenantId && (
            <>
              <NavLink to="/" end>🗺️ Mapa en vivo</NavLink>
              <NavLink to="/vehicles">🚚 Vehículos</NavLink>
              <NavLink to="/alerts">🔔 Alertas</NavLink>
              <NavLink to="/geofences">📍 Geocercas</NavLink>
              {can('admin') && <NavLink to="/devices">📡 GPS / Dispositivos</NavLink>}
              {can('admin') && <NavLink to="/users">👥 Usuarios</NavLink>}
            </>
          )}
          {isSuper && <NavLink to="/tenants">🏢 Empresas</NavLink>}
        </nav>
        <div className="user-box">
          <div>{user?.name}</div>
          <small>{user && ROLE_LABELS[user.role]}</small>
          <button className="link" onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
