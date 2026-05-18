import type { H3Event } from 'h3'
import type { Role } from '../modules/members'

/**
 * Verlangt eine bestimmte Rolle in der aktiven Session.
 *
 * Setzt `requireUserSession` voraus — typischer Aufruf-Pattern in einem
 * Handler:
 *
 *   const { user } = await requireUserSession(event)
 *   requireRole(user, 'admin')
 *
 * Wirft 403 `auth.role-required`, wenn die Rolle fehlt.
 */
export function requireRole(user: { roles: readonly Role[] }, role: Role): void {
  if (!user.roles.includes(role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'auth.role-required',
    })
  }
}

/**
 * Verlangt mindestens **eine** der angegebenen Rollen — Bsp. Mannschafts-Tag-
 * Pflege ist sowohl Admin als auch Trainer erlaubt (FR-2i).
 *
 *   requireAnyRole(user, 'admin', 'trainer')
 */
export function requireAnyRole(
  user: { roles: readonly Role[] },
  ...roles: Role[]
): void {
  if (!roles.some((r) => user.roles.includes(r))) {
    throw createError({
      statusCode: 403,
      statusMessage: 'auth.role-required',
    })
  }
}

/**
 * Convenience: parsed eine path-Param-ID als positive Integer.
 * Wirft 400, wenn der Param fehlt oder kein gültiger Integer ist.
 */
export function requireIntParam(event: H3Event, name: string): number {
  const raw = getRouterParam(event, name)
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `invalid-param:${name}`,
    })
  }
  return id
}
