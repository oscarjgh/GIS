import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api, getToken } from './api';
import { useAuth } from './auth';

/** Carga datos de la API y permite recargarlos. Se vuelve a pedir al cambiar la empresa. */
export function useApi<T>(path: string | null, query?: Record<string, string | undefined>) {
  const { tenantId, user } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const q = JSON.stringify(query ?? {});

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const params = { ...(JSON.parse(q) as Record<string, string>) };
      if (user?.role === 'superadmin' && tenantId) params.tenantId = tenantId;
      setData(await api<T>(path, { query: params }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path, q, tenantId, user?.role]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}

/** Conexión WebSocket al canal en vivo de la empresa. */
export function useRealtime(handlers: Record<string, (payload: any) => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const socket: Socket = io('/realtime', { auth: { token: getToken() }, transports: ['websocket'] });
    for (const event of ['vehicle', 'alert', 'device']) {
      socket.on(event, (payload) => ref.current[event]?.(payload));
    }
    return () => {
      socket.disconnect();
    };
  }, []);
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return 'nunca';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `hace ${Math.max(s, 0)} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleString();
}

/** Estado visual del vehículo según su último reporte. */
export function vehicleStatus(state?: { time: string; ignition?: boolean; speed?: number } | null) {
  if (!state) return { key: 'none', label: 'Sin datos', color: '#9ca3af' };
  const age = Date.now() - new Date(state.time).getTime();
  if (age > 30 * 60 * 1000) return { key: 'offline', label: 'Sin reportar', color: '#6b7280' };
  if ((state.speed ?? 0) > 3) return { key: 'moving', label: 'En movimiento', color: '#16a34a' };
  if (state.ignition) return { key: 'idle', label: 'Encendido detenido', color: '#f59e0b' };
  return { key: 'parked', label: 'Apagado', color: '#2563eb' };
}
