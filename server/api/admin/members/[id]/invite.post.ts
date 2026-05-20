import {
  MemberDeactivatedError,
  MemberNotFoundError,
  memberAdminService,
  type MemberId,
} from '../../../../modules/members'
import { requireRole } from '../../../../shared/require-role'
import { requirePublicIdParam } from '../../../../shared/public-id'

/**
 * POST /api/admin/members/:id/invite — Einladungs-Mail mit Magic-Link
 * (FR-60a). Wiederholt aufrufbar, generiert jeweils einen neuen 30-Tage-
 * Token. Liefert `emailSent: false` plus `fallbackLink`, wenn Brevo
 * fehlschlägt — der Audit-Eintrag wird in beiden Fällen geschrieben.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')

  const id = requirePublicIdParam<MemberId>(event, 'id')
  const baseUrl = getRequestURL(event).origin
  try {
    return await memberAdminService.invite(id, user.memberId, baseUrl)
  } catch (err) {
    if (err instanceof MemberNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'member.not-found' })
    }
    if (err instanceof MemberDeactivatedError) {
      throw createError({ statusCode: 409, statusMessage: 'member.deactivated' })
    }
    throw err
  }
})
