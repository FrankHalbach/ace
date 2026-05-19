import type { AgeGroupId } from '../../db/schema/age-group'
import type { MemberId } from '../../db/schema/member'
import type { RankingConfig, RankingId, RankingMode } from '../../db/schema/ranking'
import type { RankingEntryId } from '../../db/schema/ranking-entry'
import type { SeasonId } from '../../db/schema/season'

export type {
  AgeGroupId,
  MemberId,
  RankingConfig,
  RankingEntryId,
  RankingId,
  RankingMode,
  SeasonId,
}

export type RankingDto = {
  id: RankingId
  seasonId: SeasonId
  ageGroupId: AgeGroupId
  mode: RankingMode
  config: RankingConfig
  createdAt: Date
}

export type RankingEntryDto = {
  id: RankingEntryId
  rankingId: RankingId
  memberId: MemberId
  position: number
  points: number | null
  eloRating: number | null
  lastMatchAt: Date | null
  /**
   * Anzahl bestätigter Match-Ergebnisse, an denen das Mitglied in dieser
   * Rangliste beteiligt war. Walk-Over zählt für beide Spieler — der
   * Sieger hat „gewonnen", der Verlierer hat „gespielt" aber nicht gewonnen.
   * (#73)
   */
  matchesPlayed: number
  matchesWon: number
  // Angereichert für die UI
  member: {
    firstName: string
    lastName: string
    dtbLk: number
    status: 'aktiv' | 'pausiert'
  }
  display: {
    primary: string
    secondary?: string
  }
}

/** Match-Statistik je Mitglied innerhalb einer Rangliste (#73). */
export type MemberMatchStats = {
  played: number
  won: number
}

export type RankingSummaryDto = RankingDto & {
  ageGroupName: string
  seasonName: string
  entryCount: number
}

export type RankingDetailDto = RankingDto & {
  ageGroupName: string
  seasonName: string
  entries: RankingEntryDto[]
}

export type MemberRankingStandingDto = {
  rankingId: RankingId
  seasonId: SeasonId
  seasonName: string
  ageGroupName: string
  mode: RankingMode
  position: number
  points: number | null
  eloRating: number | null
  display: {
    primary: string
    secondary?: string
  }
}

export class RankingNotFoundError extends Error {
  readonly code = 'ranking.not-found' as const
  constructor(public readonly id: RankingId) {
    super(`ranking ${id} not found`)
  }
}
