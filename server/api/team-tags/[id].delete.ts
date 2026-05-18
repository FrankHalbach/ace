import {
  TeamTagNotFoundError,
  teamTagsService,
  type TeamTagId,
} from '../../modules/team-tags'
import { requireRole } from '../../shared/require-role'
import { requirePublicIdParam } from '../../shared/public-id'

/**
 * DELETE /api/team-tags/:id — Tag löschen (CASCADE auf member_team_tag).
 * Admin-only — Trainer können archivieren (PATCH active=false).
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')

  const id = requirePublicIdParam<TeamTagId>(event, 'id')
  try {
    teamTagsService.delete(id, user.memberId)
    return { ok: true }
  } catch (err) {
    if (err instanceof TeamTagNotFoundError) {
      throw createError({
        statusCode: 404,
        statusMessage: 'team-tag.not-found',
      })
    }
    throw err
  }
})
