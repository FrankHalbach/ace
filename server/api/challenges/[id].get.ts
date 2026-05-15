import {
  ChallengeNotFoundError,
  ChallengeNotParticipantError,
  challengesService,
  type ChallengeId,
} from '../../modules/challenges'
import { requireIntParam } from '../../shared/require-role'

/** GET /api/challenges/:id — Detail (nur Teilnehmer) */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requireIntParam(event, 'id') as ChallengeId
  try {
    return challengesService.getForParticipant(id, user.memberId)
  } catch (err) {
    if (err instanceof ChallengeNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'challenge.not-found' })
    }
    if (err instanceof ChallengeNotParticipantError) {
      throw createError({ statusCode: 403, statusMessage: 'challenge.not-participant' })
    }
    throw err
  }
})
