import { createParamDecorator, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Role } from '../entities';

/** Datos del usuario autenticado que viajan en el JWT. */
export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const ROLES_KEY = 'roles';
/** Restringe un endpoint a ciertos roles. El super administrador siempre pasa. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const PUBLIC_KEY = 'public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Devuelve el tenant sobre el que opera la petición.
 * - Usuarios normales: SIEMPRE su propio tenant (se ignora lo que manden).
 * - Super administrador: el tenant indicado (query ?tenantId= o en el cuerpo).
 */
export function resolveTenant(user: AuthUser, requested?: string | null): string {
  if (user.role !== Role.SUPERADMIN) {
    if (!user.tenantId) throw new ForbiddenException('Usuario sin empresa asignada');
    return user.tenantId;
  }
  if (!requested) throw new ForbiddenException('Indica tenantId para operar como super administrador');
  return requested;
}

/** Igual que resolveTenant pero permite al super administrador ver todos los tenants (null). */
export function tenantFilter(user: AuthUser, requested?: string | null): string | null {
  if (user.role === Role.SUPERADMIN) return requested || null;
  return resolveTenant(user);
}
