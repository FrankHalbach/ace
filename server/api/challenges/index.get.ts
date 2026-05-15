import { challengesService } from '../../modules/challenges'

/** GET /api/challenges — eigene Challenges (incoming + outgoing) */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return challengesService.listForMember(user.memberId)
})
