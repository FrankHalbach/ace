import {
  ChallengeInvalidTransitionError,
  ChallengeNotFoundError,
  type ChallengeId,
} from '../../../../../modules/challenges'
import { trainerDisputesService } from '../../../../../modules/trainer'
import { requireIntParam } from '../../../../../shared/require-role'
import { requireTrainerOrAdmin } from '../../../../../shared/require-trainer'

/** POST /api/trainer/disputes/challenge/:id/cancel — Trainer bricht Match ab */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireTrainerOrAdmin(user)
  const id = requireIntParam(event, 'id') as ChallengeId
  try {
    trainerDisputesService.cancelChallenge(id)
    return { ok: true }
  } catch (err) {
    if (err instanceof ChallengeNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'challenge.not-found' })
    if (err instanceof ChallengeInvalidTransitionError)
      throw createError({ statusCode: 409, statusMessage: 'challenge.invalid-transition' })
    throw err
  }
})
