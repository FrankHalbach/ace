import { SeasonNotFoundError, seasonsService, type SeasonId } from '../../modules/seasons'
import { requirePublicIdParam } from '../../shared/public-id'

/**
 * GET /api/seasons/:id — Detail inkl. Altersgruppen.
 */
export default defineEventHandler((event) => {
  const id = requirePublicIdParam<SeasonId>(event, 'id')
  try {
    return seasonsService.getDetail(id)
  } catch (err) {
    if (err instanceof SeasonNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'season.not-found' })
    }
    throw err
  }
})
