import { rankingReadService } from '../../modules/rankings'
import type {
  AgeGroupId,
  RankingFilter,
  SeasonId,
} from '../../modules/rankings'

/**
 * GET /api/rankings — Liste mit optionalen Filtern.
 * Query: seasonId, ageGroupId
 */
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const filter: RankingFilter = {}
  if (q.seasonId) filter.seasonId = Number(q.seasonId) as SeasonId
  if (q.ageGroupId) filter.ageGroupId = Number(q.ageGroupId) as AgeGroupId
  return rankingReadService.list(filter)
})
