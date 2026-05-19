import {
  LkOutOfRangeError,
  MemberNotFoundError,
  memberAdminService,
  setLkInput,
  type MemberId,
} from '../../../../modules/members'
import { requireAnyRole } from '../../../../shared/require-role'
import { requirePublicIdParam } from '../../../../shared/public-id'

/**
 * PATCH /api/admin/members/:id/lk — LK-Korrektur (FR-63, Spec §4.1).
 * Admin oder Trainer. Audit-Eintrag `member.lk-corrected`.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireAnyRole(user, 'admin', 'trainer')

  const id = requirePublicIdParam<MemberId>(event, 'id')
  const body = await readValidatedBody(event, setLkInput.parse)
  try {
    return memberAdminService.setLk(id, body.dtbLk, user.memberId, body.note)
  } catch (err) {
    if (err instanceof MemberNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'member.not-found' })
    }
    if (err instanceof LkOutOfRangeError) {
      throw createError({ statusCode: 422, statusMessage: 'lk.out-of-range' })
    }
    throw err
  }
})
