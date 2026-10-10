import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useApi, useRealtime } from '../hooks';
import { Alert } from '../types';
import { AlertTable } from './VehicleDetailPage';

export function AlertsPage() {
  const { can, tenantId } = useAuth();
  const [onlyPending, setOnlyPending] = useState(true);
  const { data, setData } = useApi<Alert[]>('/alerts', { unacknowledged: onlyPending ? 'true' : undefined });

  useRealtime({
    alert: (a: Alert & { tenantId: string }) => {
      if (a.tenantId === tenantId) setData((list) => [a, ...(list ?? [])]);
    },
  });

  async function ack(a: Alert) {
    await api(`/alerts/${a.id}/ack`, { method: 'PATCH' });
    setData((list) => (onlyPending ? list?.filter((x) => x.id !== a.id) : list?.map((x) => (x.id === a.id ? { ...x, acknowledged: true } : x))) ?? list);
  }

  return (
    <div className="page">
      <div className="row-between">
        <h1>Alertas</h1>
        <label className="row">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Solo pendientes
        </label>
      </div>
      <div className="card">
        <AlertTable alerts={data ?? []} onAck={can('admin', 'operator') ? ack : undefined} />
      </div>
    </div>
  );
}
