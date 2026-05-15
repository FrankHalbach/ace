import { profileService, updateOwnProfileInput } from '../../modules/members'

/**
 * PATCH /api/members/me
 * Eigenes Profil ändern. Validierung via Zod.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readValidatedBody(event, updateOwnProfileInput.parse)
  return profileService.updateOwnProfile(user.memberId, body)
})
