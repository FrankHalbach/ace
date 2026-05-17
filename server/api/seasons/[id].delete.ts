import { SeasonFrozenError, SeasonNotFoundError, seasonsService, type SeasonId } from '../../modules/seasons'
import { requireRole } from '../../shared/require-role'
import { requirePublicIdParam } from '../../shared/public-id'

/**
 * DELETE /api/seasons/:id — Admin-only, nur im Status PLANNED erlaubt.
 * Cascadet alle zugehörigen Altersgruppen.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')

  const id = requirePublicIdParam<SeasonId>(event, 'id')
  try {
    seasonsService.delete(id)
    return { ok: true }
  } catch (err) {
    if (err instanceof SeasonNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'season.not-found' })
    }
    if (err instanceof SeasonFrozenError) {
      throw createError({ statusCode: 409, statusMessage: 'season.frozen' })
    }
    throw err
  }
})
