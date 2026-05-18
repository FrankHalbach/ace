import { memberAdminService } from '../../../modules/members'
import { requireRole } from '../../../shared/require-role'

/**
 * GET /api/admin/members — Vollstaendige Mitgliederliste fuer Admins (FR-60).
 * Liefert auch deaktivierte Mitglieder und Lifecycle-Felder
 * (deactivatedAt, invitedAt, firstLoginAt). Sortiert nach Nachname.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')
  return memberAdminService.listAll()
})
