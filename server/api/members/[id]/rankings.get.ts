import { rankingReadService, type MemberId } from '../../../modules/rankings'
import { requireIntParam } from '../../../shared/require-role'

/**
 * GET /api/members/:id/rankings — alle Rangliste-Plätze eines Mitglieds.
 * FR-14: „im Spielerprofil sind alle Plätze in allen Ranglisten transparent dargestellt".
 */
export default defineEventHandler((event) => {
  const id = requireIntParam(event, 'id') as MemberId
  return rankingReadService.listStandingsForMember(id)
})
