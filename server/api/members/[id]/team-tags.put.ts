import {
  setMemberTeamTagsInput,
  TeamTagInactiveError,
  TeamTagNotFoundError,
  teamTagsService,
  type TeamTagId,
} from '../../../modules/team-tags'
import type { MemberId } from '../../../modules/members'
import { requireAnyRole } from '../../../shared/require-role'
import { requirePublicIdParam } from '../../../shared/public-id'

/**
 * PUT /api/members/:id/team-tags — Setzt die vollständige Tag-Liste eines
 * Mitglieds (FR-2i). Replaces all assignments, idempotent.
 * Admin oder Trainer.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireAnyRole(user, 'admin', 'trainer')

  const memberId = requirePublicIdParam<MemberId>(event, 'id')
  const body = await readValidatedBody(event, setMemberTeamTagsInput.parse)
  try {
    return teamTagsService.setAssignments({
      memberId,
      tagIds: body.tagIds as TeamTagId[],
      assignedBy: user.memberId,
    })
  } catch (err) {
    if (err instanceof TeamTagNotFoundError) {
      throw createError({
        statusCode: 404,
        statusMessage: 'team-tag.not-found',
      })
    }
    if (err instanceof TeamTagInactiveError) {
      throw createError({
        statusCode: 422,
        statusMessage: 'team-tag.inactive',
      })
    }
    throw err
  }
})
