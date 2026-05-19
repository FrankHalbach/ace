import {
  CannotRemoveLastAdminError,
  MemberAlreadyDeactivatedError,
  MemberNotFoundError,
  deactivateMemberInput,
  memberAdminService,
  type MemberId,
} from '../../../../modules/members'
import { requireRole } from '../../../../shared/require-role'
import { requirePublicIdParam } from '../../../../shared/public-id'

/**
 * POST /api/admin/members/:id/deactivate — Soft-Delete (FR-60b).
 * Admin-only. Setzt `status='pausiert'` + `deactivatedAt`.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')

  const id = requirePublicIdParam<MemberId>(event, 'id')
  const body = await readValidatedBody(event, deactivateMemberInput.parse)
  try {
    return memberAdminService.deactivate(id, body.reason, user.memberId)
  } catch (err) {
    if (err instanceof MemberNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'member.not-found' })
    }
    if (err instanceof MemberAlreadyDeactivatedError) {
      throw createError({ statusCode: 409, statusMessage: 'member.already-deactivated' })
    }
    if (err instanceof CannotRemoveLastAdminError) {
      throw createError({ statusCode: 422, statusMessage: 'member.cannot-remove-last-admin' })
    }
    throw err
  }
})
