import {
  friendliesService,
  FriendlyNotFoundError,
  FriendlyNotParticipantError,
  type FriendlyId,
} from '../../modules/friendlies'
import { requirePublicIdParam } from '../../shared/public-id'

/** GET /api/friendlies/:id — Detail (nur Teilnehmer) */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requirePublicIdParam<FriendlyId>(event, 'id')
  try {
    return friendliesService.getDetail(id, user.memberId)
  } catch (err) {
    if (err instanceof FriendlyNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'friendly.not-found' })
    if (err instanceof FriendlyNotParticipantError)
      throw createError({ statusCode: 403, statusMessage: 'friendly.not-participant' })
    throw err
  }
})
