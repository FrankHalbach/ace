import {
  friendliesService,
  FriendlyNotFoundError,
  FriendlyNotParticipantError,
  type FriendlyId,
} from '../../modules/friendlies'
import { requireIntParam } from '../../shared/require-role'

/** GET /api/friendlies/:id — Detail (nur Teilnehmer) */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requireIntParam(event, 'id') as FriendlyId
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
