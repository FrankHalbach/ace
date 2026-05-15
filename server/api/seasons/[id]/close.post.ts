import {
  SeasonInvalidTransitionError,
  SeasonNotFoundError,
  seasonsService,
  type SeasonId,
} from '../../../modules/seasons'
import { requireIntParam, requireRole } from '../../../shared/require-role'

/** POST /api/seasons/:id/close — ACTIVE → CLOSED */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')
  const id = requireIntParam(event, 'id') as SeasonId

  try {
    return seasonsService.close(id)
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
