import {
  ChallengeInvalidTransitionError,
  ChallengeNotFoundError,
  type ChallengeId,
} from '../../../../../modules/challenges'
import { AlreadyConfirmedError, MatchResultNotFoundError } from '../../../../../modules/results'
import { DisputeNotFoundError, trainerDisputesService } from '../../../../../modules/trainer'
import { requirePublicIdParam } from '../../../../../shared/public-id'
import { requireTrainerOrAdmin } from '../../../../../shared/require-trainer'

/** POST /api/trainer/disputes/challenge/:id/confirm — Trainer bestätigt */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireTrainerOrAdmin(user)
  const id = requirePublicIdParam<ChallengeId>(event, 'id')
  try {
    trainerDisputesService.confirmChallenge(id)
    return { ok: true }
  } catch (err) {
    if (err instanceof DisputeNotFoundError || err instanceof MatchResultNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'result.not-found' })
    if (err instanceof ChallengeNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'challenge.not-found' })
    if (err instanceof ChallengeInvalidTransitionError)
      throw createError({ statusCode: 409, statusMessage: 'challenge.invalid-transition' })
    if (err instanceof AlreadyConfirmedError)
      throw createError({ statusCode: 409, statusMessage: 'result.already-confirmed' })
    throw err
  }
})
