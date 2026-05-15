import { friendlyResultsService, type FriendlyId } from '../../../modules/friendlies'
import { requireIntParam } from '../../../shared/require-role'

/** GET /api/friendly-results/by-friendly/:id — bequeme Lookup-Route fürs UI */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = requireIntParam(event, 'id') as FriendlyId
  return friendlyResultsService.findForFriendly(id) ?? null
})
