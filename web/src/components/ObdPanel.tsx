import { OBD_LABELS } from '../types';

export function ObdPanel({ obd }: { obd?: Record<string, number> }) {
  const entries = Object.entries(obd ?? {});
  if (!entries.length) return <p className="muted">Sin datos OBD2 (conecta el ELM327 con la app).</p>;
  return (
    <div className="obd-grid">
      {entries.map(([k, v]) => {
        const meta = OBD_LABELS[k] ?? { label: k, unit: '' };
        const warn = (k === 'coolantTemp' && v >= 105) || (k === 'voltage' && v < 11.8);
        return (
          <div key={k} className={`obd-tile${warn ? ' warn' : ''}`}>
            <div className="obd-value">
              {Number.isInteger(v) ? v : v.toFixed(1)}
              <small> {meta.unit}</small>
            </div>
            <div className="obd-label">{meta.label}</div>
          </div>
        );
      })}
    </div>
  );
}
