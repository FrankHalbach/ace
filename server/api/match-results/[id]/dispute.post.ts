import {
  AlreadyConfirmedError,
  disputeResultInput,
  MatchResultNotFoundError,
  NotLoserError,
  resultsService,
  type MatchResultId,
} from '../../../modules/results'
import { requireIntParam } from '../../../shared/require-role'

/** POST /api/match-results/:id/dispute — Verlierer widerspricht */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requireIntParam(event, 'id') as MatchResultId
  const body = await readValidatedBody(event, disputeResultInput.parse)
  try {
    return resultsService.dispute(id, user.memberId, body)
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
