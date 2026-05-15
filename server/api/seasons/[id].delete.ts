import { SeasonFrozenError, SeasonNotFoundError, seasonsService, type SeasonId } from '../../modules/seasons'
import { requireIntParam, requireRole } from '../../shared/require-role'

/**
 * DELETE /api/seasons/:id — Admin-only, nur im Status PLANNED erlaubt.
 * Cascadet alle zugehörigen Altersgruppen.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')

  const id = requireIntParam(event, 'id') as SeasonId
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
