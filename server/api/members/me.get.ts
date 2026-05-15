import { profileService } from '../../modules/members'

/**
 * GET /api/members/me
 * Eigenes Profil (Session-Auflösung über die zentrale Middleware vorausgesetzt).
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return profileService.getOwnProfile(user.memberId)
})
