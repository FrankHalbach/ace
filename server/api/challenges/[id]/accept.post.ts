import {
  ChallengeInvalidTransitionError,
  ChallengeNotFoundError,
  ChallengeNotParticipantError,
  challengesService,
  type ChallengeId,
} from '../../../modules/challenges'
import { requirePublicIdParam } from '../../../shared/public-id'

/** POST /api/challenges/:id/accept — nur Challenged */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requirePublicIdParam<ChallengeId>(event, 'id')
  try {
    return challengesService.accept(id, user.memberId)
  } catch (err) {
    if (err instanceof ChallengeNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'challenge.not-found' })
    if (err instanceof ChallengeNotParticipantError)
      throw createError({ statusCode: 403, statusMessage: 'challenge.not-participant' })
    if (err instanceof ChallengeInvalidTransitionError)
      throw createError({ statusCode: 409, statusMessage: 'challenge.invalid-transition' })
    throw err
  }
})
