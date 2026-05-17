import { rankingReadService, type MemberId } from '../../../modules/rankings'
import { requirePublicIdParam } from '../../../shared/public-id'

/**
 * GET /api/members/:id/rankings — alle Rangliste-Plätze eines Mitglieds.
 * FR-14: „im Spielerprofil sind alle Plätze in allen Ranglisten transparent dargestellt".
 */
export default defineEventHandler((event) => {
  const id = requirePublicIdParam<MemberId>(event, 'id')
  return rankingReadService.listStandingsForMember(id)
})
