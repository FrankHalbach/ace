import {
  friendliesService,
  FriendlyInvalidTransitionError,
  FriendlyNotFoundError,
  FriendlyNotParticipantError,
  type FriendlyId,
} from '../../../modules/friendlies'
import { requireIntParam } from '../../../shared/require-role'

/** POST /api/friendlies/:id/cancel — Initiator zieht zurück */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requireIntParam(event, 'id') as FriendlyId
  try {
    return friendliesService.cancel(id, user.memberId)
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
