import { friendlyResultsService, type FriendlyId } from '../../../modules/friendlies'
import { requirePublicIdParam } from '../../../shared/public-id'

/** GET /api/friendly-results/by-friendly/:id — bequeme Lookup-Route fürs UI */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = requirePublicIdParam<FriendlyId>(event, 'id')
  return friendlyResultsService.findForFriendly(id) ?? null
})
