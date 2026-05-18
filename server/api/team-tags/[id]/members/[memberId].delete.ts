import {
  TeamTagNotFoundError,
  teamTagsService,
  type TeamTagId,
} from '../../../../modules/team-tags'
import type { MemberId } from '../../../../modules/members'
import { requireAnyRole } from '../../../../shared/require-role'
import { requirePublicIdParam } from '../../../../shared/public-id'

/**
 * DELETE /api/team-tags/:id/members/:memberId — Spieler aus Mannschaft
 * entfernen. Idempotent. Antwortet mit der neuen Mitgliederliste.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireAnyRole(user, 'admin', 'trainer')

  const tagId = requirePublicIdParam<TeamTagId>(event, 'id')
  const memberId = requirePublicIdParam<MemberId>(event, 'memberId')
  try {
    return teamTagsService.removeMember(tagId, memberId, user.memberId)
  } catch (err) {
    if (err instanceof TeamTagNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'team-tag.not-found' })
    }
    throw err
  }
})
