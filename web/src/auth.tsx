import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { api, getSelectedTenant, getToken, setSelectedTenant, setToken } from './api';
import { User } from './types';

interface AuthContextValue {
  user: User | null;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  /** Empresa sobre la que se trabaja: la propia, o la elegida por el super admin. */
  tenantId: string | null;
  selectTenant(id: string | null): void;
  can(...roles: User['role'][]): boolean;
}

const AuthContext = createContext<AuthContextValue>(null!);
const USER_KEY = 'flota.user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw && getToken() ? (JSON.parse(raw) as User) : null;
  });
  const [selected, setSelected] = useState<string | null>(getSelectedTenant());

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ accessToken: string; user: User }>('/auth/login', { method: 'POST', body: { email, password } });
    setToken(res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setSelectedTenant(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login,
      logout,
      tenantId: user?.role === 'superadmin' ? selected : user?.tenantId ?? null,
      selectTenant(id) {
        setSelectedTenant(id);
        setSelected(id);
      },
      can: (...roles) => !!user && (user.role === 'superadmin' || roles.includes(user.role)),
    }),
    [user, selected, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
