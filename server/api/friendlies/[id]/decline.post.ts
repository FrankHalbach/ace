import {
  friendliesService,
  FriendlyInvalidTransitionError,
  FriendlyNotFoundError,
  FriendlyNotParticipantError,
  FriendlyValidationError,
  type FriendlyId,
} from '../../../modules/friendlies'
import { requirePublicIdParam } from '../../../shared/public-id'

/** POST /api/friendlies/:id/decline — Eingeladener lehnt ab */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requirePublicIdParam<FriendlyId>(event, 'id')
  try {
    return friendliesService.decline(id, user.memberId)
  } catch (err) {
    if (err instanceof FriendlyNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'friendly.not-found' })
    if (err instanceof FriendlyNotParticipantError)
      throw createError({ statusCode: 403, statusMessage: 'friendly.not-participant' })
    if (err instanceof FriendlyInvalidTransitionError)
      throw createError({ statusCode: 409, statusMessage: 'friendly.invalid-transition' })
    if (err instanceof FriendlyValidationError)
      throw createError({ statusCode: 409, statusMessage: err.code, data: { message: err.message } })
    throw err
  }
})
