import { friendliesService } from '../../modules/friendlies'

/** GET /api/friendlies — eigene Friendlies (Initiator + Eingeladener) */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return friendliesService.listForMember(user.memberId)
})
