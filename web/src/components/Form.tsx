import { FormEvent, ReactNode, useState } from 'react';
import { useAuth } from '../auth';

/** Agrega tenantId al cuerpo cuando el super admin opera sobre una empresa. */
export function useTenantBody() {
  const { user, tenantId } = useAuth();
  return <T extends object>(body: T) => (user?.role === 'superadmin' && tenantId ? { ...body, tenantId } : body);
}

export function FormCard({ title, onSubmit, children, submitLabel = 'Guardar' }: { title: string; onSubmit: () => Promise<void>; children: ReactNode; submitLabel?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card form" onSubmit={submit}>
      <h3>{title}</h3>
      <div className="form-grid">{children}</div>
      {error && <div className="error">{error}</div>}
      <button disabled={busy}>{busy ? 'Guardando…' : submitLabel}</button>
    </form>
  );
}
