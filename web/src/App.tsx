import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { AlertsPage } from './pages/AlertsPage';
import { DevicesPage } from './pages/DevicesPage';
import { GeofencesPage } from './pages/GeofencesPage';
import { LoginPage } from './pages/LoginPage';
import { MapPage } from './pages/MapPage';
import { TenantsPage } from './pages/TenantsPage';
import { UsersPage } from './pages/UsersPage';
import { VehicleDetailPage } from './pages/VehicleDetailPage';
import { VehiclesPage } from './pages/VehiclesPage';

export function App() {
  const { user, tenantId } = useAuth();
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  const needsTenant = user.role === 'superadmin' && !tenantId;
  return (
    <Layout>
      <Routes>
        <Route path="/tenants" element={<TenantsPage />} />
        {needsTenant ? (
          <Route path="*" element={<Navigate to="/tenants" replace />} />
        ) : (
          <>
            <Route path="/" element={<MapPage />} />
            <Route path="/vehicles" element={<VehiclesPage />} />
            <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/geofences" element={<GeofencesPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </Layout>
  );
}
