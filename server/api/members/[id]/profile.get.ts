import { getMemberProfile, MemberNotFoundError, type MemberId } from '../../../modules/members'
import { requireIntParam } from '../../../shared/require-role'

/** GET /api/members/:id/profile — voll aggregiertes Spieler-Profil */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requireIntParam(event, 'id') as MemberId
  try {
    return getMemberProfile(id, user.memberId)
  } catch (err) {
    if (err instanceof MemberNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'member.not-found' })
    throw err
  }
})
