import {
  friendliesService,
  FriendlyInvalidTransitionError,
  FriendlyNotFoundError,
  FriendlyNotParticipantError,
  type FriendlyId,
} from '../../../modules/friendlies'
import { requirePublicIdParam } from '../../../shared/public-id'

/** POST /api/friendlies/:id/mark-played — Teilnehmer markiert „gespielt, kein Ergebnis" */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requirePublicIdParam<FriendlyId>(event, 'id')
  try {
    return friendliesService.markPlayed(id, user.memberId)
  } catch (err) {
    if (err instanceof FriendlyNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'friendly.not-found' })
    if (err instanceof FriendlyNotParticipantError)
      throw createError({ statusCode: 403, statusMessage: 'friendly.not-participant' })
    if (err instanceof FriendlyInvalidTransitionError)
      throw createError({ statusCode: 409, statusMessage: 'friendly.invalid-transition' })
    throw err
  }
})
