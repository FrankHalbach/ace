import {
  MemberNotDeactivatedError,
  MemberNotFoundError,
  memberAdminService,
  type MemberId,
} from '../../../../modules/members'
import { requireRole } from '../../../../shared/require-role'
import { requirePublicIdParam } from '../../../../shared/public-id'

/**
 * POST /api/admin/members/:id/reactivate — hebt Admin-Deaktivierung auf.
 * Admin-only.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')

  const id = requirePublicIdParam<MemberId>(event, 'id')
  try {
    return memberAdminService.reactivate(id, user.memberId)
  } catch (err) {
    if (err instanceof MemberNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'member.not-found' })
    }
    if (err instanceof MemberNotDeactivatedError) {
      throw createError({ statusCode: 409, statusMessage: 'member.not-deactivated' })
    }
    throw err
  }
})
