import type { Role, SessionView } from '../../members'
import type { SessionUser } from '../types'

export type SessionRefreshOutcome =
  | { action: 'pass' }
  | { action: 'update'; user: SessionUser }
  | { action: 'reject'; reason: 'member-not-found' | 'member-deactivated' }

function rolesEqual(a: readonly Role[], b: readonly Role[]): boolean {
  if (a.length !== b.length) return false
  const sa = new Set(a)
  for (const r of b) if (!sa.has(r)) return false
  return true
}

/**
 * Vergleicht die Session-Roles mit dem aktuellen DB-Stand und entscheidet,
 * ob die Session passiert, aktualisiert oder verworfen werden muss (#90).
 *
 * Pure Funktion ohne Side-Effects — die Middleware kümmert sich um den
 * I/O-Teil (DB-Lookup, setUserSession, throw).
 *
 *   - Member nicht in DB → reject (verwaister Cookie)
 *   - Member admin-deaktiviert → reject (Self-Pause bleibt erlaubt)
 *   - Rollen identisch → pass
 *   - Rollen geändert → update mit frischen Rollen
 */
export function evaluateSessionRefresh(
  sessionUser: SessionUser,
  member: SessionView | undefined,
): SessionRefreshOutcome {
  if (!member) return { action: 'reject', reason: 'member-not-found' }
  if (member.adminDeactivated) {
    return { action: 'reject', reason: 'member-deactivated' }
  }
  if (rolesEqual(sessionUser.roles, member.roles)) return { action: 'pass' }
  return {
    action: 'update',
    user: { memberId: member.id, roles: member.roles },
  }
}
