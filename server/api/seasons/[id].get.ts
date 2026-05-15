import { SeasonNotFoundError, seasonsService, type SeasonId } from '../../modules/seasons'
import { requireIntParam } from '../../shared/require-role'

/**
 * GET /api/seasons/:id — Detail inkl. Altersgruppen.
 */
export default defineEventHandler((event) => {
  const id = requireIntParam(event, 'id') as SeasonId
  try {
    return seasonsService.getDetail(id)
  } catch (err) {
    if (err instanceof SeasonNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'season.not-found' })
    }
    throw err
  }
})
