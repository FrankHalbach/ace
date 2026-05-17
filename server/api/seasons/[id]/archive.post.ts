import {
  SeasonInvalidTransitionError,
  SeasonNotFoundError,
  seasonsService,
  type SeasonId,
} from '../../../modules/seasons'
import { requireRole } from '../../../shared/require-role'
import { requirePublicIdParam } from '../../../shared/public-id'

/** POST /api/seasons/:id/archive — CLOSED → ARCHIVED */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')
  const id = requirePublicIdParam<SeasonId>(event, 'id')

  try {
    return seasonsService.archive(id)
  } catch (err) {
    if (err instanceof SeasonNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'season.not-found' })
    }
    if (err instanceof SeasonInvalidTransitionError) {
      throw createError({ statusCode: 409, statusMessage: 'season.invalid-transition' })
    }
    throw err
  }
})
