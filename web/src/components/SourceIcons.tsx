import { timeAgo } from '../hooks';
import { DataSource, SourceStatus, Vehicle } from '../types';

const ACTIVE_MS = 5 * 60 * 1000;

const META: Record<DataSource, { icon: string; label: string }> = {
  gps: { icon: '📡', label: 'GPS del vehículo' },
  phone: { icon: '📱', label: 'Celular (app)' },
  scanner: { icon: '🔧', label: 'Escáner OBD2' },
};

/**
 * Estado de cada fuente combinando lo que mandó el servidor al cargar con lo que
 * llega en vivo por WebSocket (lastState.sources).
 */
export function liveSources(v: Vehicle): Record<DataSource, SourceStatus> {
  const result = {} as Record<DataSource, SourceStatus>;
  for (const key of Object.keys(META) as DataSource[]) {
    const base = v.sources?.[key];
    const times = [base?.lastSeen, v.lastState?.sources?.[key]].filter(Boolean).map((t) => new Date(t!).getTime());
    const last = times.length ? Math.max(...times) : null;
    result[key] = {
      registered: !!base?.registered || last !== null,
      active: last !== null && Date.now() - last < ACTIVE_MS,
      lastSeen: last !== null ? new Date(last).toISOString() : null,
    };
  }
  return result;
}

/** Íconos compactos: solo muestra lo que el vehículo tiene; atenuado si no está reportando. */
export function SourceIcons({ vehicle }: { vehicle: Vehicle }) {
  const sources = liveSources(vehicle);
  return (
    <span className="source-icons">
      {(Object.keys(META) as DataSource[])
        .filter((k) => sources[k].registered)
        .map((k) => (
          <span
            key={k}
            className={sources[k].active ? 'src on' : 'src off'}
            title={`${META[k].label}: ${sources[k].active ? 'reportando' : 'sin reportar'} (${timeAgo(sources[k].lastSeen)})`}
          >
            {META[k].icon}
          </span>
        ))}
    </span>
  );
}

/** Tarjeta con el detalle de qué hay a la mano y qué se está leyendo. */
export function SourcesCard({ vehicle }: { vehicle: Vehicle }) {
  const s = liveSources(vehicle);
  const positionFrom = vehicle.lastState?.positionSource;
  const summary =
    s.gps.active && s.scanner.active
      ? 'Ubicación por el GPS del vehículo y datos del motor por el escáner.'
      : s.gps.active
        ? 'Ubicación por el GPS del vehículo. Sin escáner conectado: no hay datos del motor.'
        : s.phone.active && s.scanner.active
          ? 'El celular da la ubicación y lee el escáner.'
          : s.phone.active
            ? 'Solo el celular está reportando: hay ubicación pero no datos del motor.'
            : s.scanner.active
              ? 'Solo llegan datos del motor (sin ubicación).'
              : 'Ninguna fuente está reportando en este momento.';
  return (
    <section className="card">
      <h3>Fuentes de datos (detección automática)</h3>
      <div className="sources-grid">
        {(Object.keys(META) as DataSource[]).map((k) => (
          <div key={k} className={`source-tile ${s[k].active ? 'on' : s[k].registered ? 'idle' : 'none'}`}>
            <div className="source-icon">{META[k].icon}</div>
            <strong>{META[k].label}</strong>
            <div className="small">
              {s[k].active ? '● Reportando' : s[k].registered ? `○ Sin reportar · ${timeAgo(s[k].lastSeen)}` : 'No tiene'}
            </div>
            {k !== 'scanner' && positionFrom && s[k].active && (positionFrom === 'mobile') === (k === 'phone') && (
              <div className="small ok">Fuente de la ubicación</div>
            )}
          </div>
        ))}
      </div>
      <p className="muted small">{summary}</p>
    </section>
  );
}
