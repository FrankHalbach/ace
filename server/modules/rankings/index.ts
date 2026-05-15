/**
 * Rankings-Modul Public API (ADR-005).
 *
 * Match-Mutationen (Position-Tausch, Punkte-Addition) sind hier NICHT
 * exportiert — die kommen mit `challenges` und `results`.
 */
export { generateForSeason } from './service/generate'
export { rankingReadService } from './service/read'
export { RankingNotFoundError } from './types'
export type {
  MemberRankingStandingDto,
  RankingConfig,
  RankingDetailDto,
  RankingDto,
  RankingEntryDto,
  RankingId,
  RankingMode,
  RankingSummaryDto,
  RankingVariant,
} from './types'
export type { RankingFilter } from './service/read'
