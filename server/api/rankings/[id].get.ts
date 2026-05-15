import { RankingNotFoundError, rankingReadService, type RankingId } from '../../modules/rankings'
import { requireIntParam } from '../../shared/require-role'

/**
 * GET /api/rankings/:id — Detail inkl. Einträge.
 * Query: onlyActive=true filtert pausierte Spieler raus (FR-13).
 */
export default defineEventHandler((event) => {
  const id = requireIntParam(event, 'id') as RankingId
  const onlyActive = getQuery(event).onlyActive === 'true'
  try {
    return rankingReadService.getDetail(id, { onlyActive })
  } catch (err) {
    if (err instanceof RankingNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'ranking.not-found' })
    }
    throw err
  }
})
