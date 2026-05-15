import { rankingReadService } from '../../modules/rankings'
import type {
  AgeGroupId,
  RankingFilter,
  RankingVariant,
  SeasonId,
} from '../../modules/rankings'

/**
 * GET /api/rankings — Liste mit optionalen Filtern.
 * Query: seasonId, ageGroupId, variant
 */
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const filter: RankingFilter = {}
  if (q.seasonId) filter.seasonId = Number(q.seasonId) as SeasonId
  if (q.ageGroupId) filter.ageGroupId = Number(q.ageGroupId) as AgeGroupId
  if (typeof q.variant === 'string' && ['herren', 'damen', 'offen'].includes(q.variant)) {
    filter.variant = q.variant as RankingVariant
  }
  return rankingReadService.list(filter)
})
