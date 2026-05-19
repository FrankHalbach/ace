/**
 * Rankings-Modul Public API (ADR-005).
 */
export { generateForSeason } from './service/generate'
export { rankingReadService } from './service/read'
export { applyMutations, getRankingEntries, getRankingMeta } from './service/mutations'
export { strategyFor } from './strategy'
export { RankingNotFoundError } from './types'
export type {
  ApplyResultInput,
  RankingMutation,
  ValidateChallengeInput,
  ValidationResult,
} from './strategy/types'
export type {
  AgeGroupId,
  MemberId,
  MemberMatchStats,
  MemberRankingStandingDto,
  RankingConfig,
  RankingDetailDto,
  RankingDto,
  RankingEntryDto,
  RankingId,
  RankingMode,
  RankingSummaryDto,
  SeasonId,
} from './types'
export type { RankingFilter } from './service/read'
