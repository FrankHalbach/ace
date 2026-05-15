import type { Role } from '../modules/members'

/**
 * Verlangt Trainer- ODER Admin-Rolle in der aktiven Session.
 *
 * Nutzung:
 *   const { user } = await requireUserSession(event)
 *   requireTrainerOrAdmin(user)
 */
export function requireTrainerOrAdmin(user: { roles: readonly Role[] }): void {
  if (user.roles.includes('trainer') || user.roles.includes('admin')) return
  throw createError({
    statusCode: 403,
    statusMessage: 'auth.role-required',
  })
}
