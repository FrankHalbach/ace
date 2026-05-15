import {
  AlreadyConfirmedError,
  MatchResultNotFoundError,
  NotLoserError,
  resultsService,
  type MatchResultId,
} from '../../../modules/results'
import { requireIntParam } from '../../../shared/require-role'

/** POST /api/match-results/:id/confirm — Verlierer bestätigt */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requireIntParam(event, 'id') as MatchResultId
  try {
    return resultsService.confirm(id, user.memberId)
  } catch (err) {
    if (err instanceof MatchResultNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'result.not-found' })
    if (err instanceof NotLoserError)
      throw createError({ statusCode: 403, statusMessage: 'result.not-loser' })
    if (err instanceof AlreadyConfirmedError)
      throw createError({ statusCode: 409, statusMessage: 'result.already-confirmed' })
    throw err
  }
})
