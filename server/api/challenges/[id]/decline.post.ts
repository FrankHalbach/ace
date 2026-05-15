import {
  ChallengeInvalidTransitionError,
  ChallengeNotFoundError,
  ChallengeNotParticipantError,
  challengesService,
  declineChallengeInput,
  type ChallengeId,
} from '../../../modules/challenges'
import { requireIntParam } from '../../../shared/require-role'

/** POST /api/challenges/:id/decline — nur Challenged, mit Grund */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requireIntParam(event, 'id') as ChallengeId
  const body = await readValidatedBody(event, declineChallengeInput.parse)
  try {
    return challengesService.decline(id, user.memberId, body)
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
