import {
  createTeamTagInput,
  TeamTagDuplicateNameError,
  teamTagsService,
} from '../../modules/team-tags'
import { requireAnyRole } from '../../shared/require-role'

/**
 * POST /api/team-tags — Neuer Mannschafts-Tag (FR-2i).
 * Admin oder Trainer.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireAnyRole(user, 'admin', 'trainer')

  const body = await readValidatedBody(event, createTeamTagInput.parse)
  try {
    return teamTagsService.create(body, user.memberId)
  } catch (err) {
    if (err instanceof TeamTagDuplicateNameError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'team-tag.duplicate-name',
      })
    }
    throw err
  }
})
