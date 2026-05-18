import {
  TeamTagDuplicateNameError,
  TeamTagNotFoundError,
  teamTagsService,
  updateTeamTagInput,
  type TeamTagId,
} from '../../modules/team-tags'
import { requireAnyRole } from '../../shared/require-role'
import { requirePublicIdParam } from '../../shared/public-id'

/**
 * PATCH /api/team-tags/:id — Umbenennen, Sortierung, Archiv-Toggle (FR-2i).
 * Admin oder Trainer.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireAnyRole(user, 'admin', 'trainer')

  const id = requirePublicIdParam<TeamTagId>(event, 'id')
  const body = await readValidatedBody(event, updateTeamTagInput.parse)
  try {
    return teamTagsService.update(id, body, user.memberId)
  } catch (err) {
    if (err instanceof TeamTagNotFoundError) {
      throw createError({
        statusCode: 404,
        statusMessage: 'team-tag.not-found',
      })
    }
    if (err instanceof TeamTagDuplicateNameError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'team-tag.duplicate-name',
      })
    }
    throw err
  }
})
