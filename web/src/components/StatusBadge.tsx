import { vehicleStatus } from '../hooks';
import { VehicleState } from '../types';

export function StatusBadge({ state }: { state: VehicleState | null }) {
  const s = vehicleStatus(state);
  return (
    <span className="badge" style={{ background: s.color }}>
      {s.label}
    </span>
  );
}
