import {
  AlreadyConfirmedError,
  ChallengeNotAcceptedError,
  InvalidSetsError,
  NotWinnerOrLoserError,
  reportResultInput,
  resultsService,
} from '../../../modules/results'
import type { ChallengeId } from '../../../modules/challenges'
import { requirePublicIdParam } from '../../../shared/public-id'

/** POST /api/challenges/:id/result — Sieger meldet Ergebnis */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requirePublicIdParam<ChallengeId>(event, 'id')
  const body = await readValidatedBody(event, reportResultInput.parse)
  try {
    return resultsService.report(id, user.memberId, body)
  } catch (err) {
    if (err instanceof ChallengeNotAcceptedError)
      throw createError({ statusCode: 409, statusMessage: 'result.challenge-not-accepted' })
    if (err instanceof NotWinnerOrLoserError)
      throw createError({ statusCode: 403, statusMessage: 'result.not-winner-or-loser' })
    if (err instanceof InvalidSetsError)
      throw createError({ statusCode: 400, statusMessage: 'result.invalid-sets' })
    if (err instanceof AlreadyConfirmedError)
      throw createError({ statusCode: 409, statusMessage: 'result.already-confirmed' })
    throw err
  }
})
