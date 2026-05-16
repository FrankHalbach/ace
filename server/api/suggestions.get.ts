import { suggestionsService } from '../modules/suggestions'

/** GET /api/suggestions — eigene Spielpartner-Vorschläge (max. 5) */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return suggestionsService.suggestFor(user.memberId)
})
