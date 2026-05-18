import {
  TeamTagNotFoundError,
  teamTagsService,
  type TeamTagId,
} from '../../../modules/team-tags'
import { requireAnyRole } from '../../../shared/require-role'
import { requirePublicIdParam } from '../../../shared/public-id'

/**
 * GET /api/team-tags/:id/members — Mitglieder einer Mannschaft (FR-2i).
 * Auch fuer archivierte Tags abrufbar, damit bestehende Zuordnungen
 * weiterhin gepflegt werden koennen.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireAnyRole(user, 'admin', 'trainer')

  const id = requirePublicIdParam<TeamTagId>(event, 'id')
  try {
    return teamTagsService.listMembersForTag(id)
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
