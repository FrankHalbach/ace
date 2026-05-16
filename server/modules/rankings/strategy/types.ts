import type { ZodType } from 'zod'
import type { MemberDto, MemberId } from '../../members'
import type { RankingConfig, RankingMode } from '../../../db/schema/ranking'
import type { RankingEntryId, RankingEntryRow } from '../../../db/schema/ranking-entry'

export type { RankingConfig, RankingMode }

/** Verfügbare Saison-Übergangs-Strategien (FR-15a). */
export type TransitionStrategy = 'takeover' | 'reset' | 'softened'

export type InitialOrderInput = {
  members: MemberDto[]
  transition: TransitionStrategy
  previousEntries?: { memberId: MemberId; position: number }[]
}

export type InitialEntryFields = {
  points?: number | null
  eloRating?: number | null
}

export type DisplayInfo = {
  primary: string
  secondary?: string
}

export type EntryDisplayInput = {
  position: number
  points: number | null
  eloRating: number | null
}

// -----------------------------------------------------------------------------
// Challenge-Validation und Result-Application (challenges-results-Feature)
// -----------------------------------------------------------------------------

export type ValidateChallengeInput = {
  challengerEntry: RankingEntryRow
  challengedEntry: RankingEntryRow
  config: RankingConfig
}

export type ValidationResult = { ok: true } | { ok: false; reason: string; code?: string }

export type PointsAwardReason = 'challenge-win' | 'challenge-loss' | 'walkover-win'

export type RankingMutation =
  | { kind: 'set-position'; entryId: RankingEntryId; position: number }
  | { kind: 'set-points'; entryId: RankingEntryId; points: number }
  | { kind: 'set-elo'; entryId: RankingEntryId; eloRating: number }
  | { kind: 'set-last-match'; entryId: RankingEntryId; at: Date }
  | {
      kind: 'award-points'
      memberId: MemberId
      rankingEntryId: RankingEntryId
      points: number
      reason: PointsAwardReason
    }

/**
 * Rangliste-Eintrag mit der LK des Mitglieds — für Tiebreaker in der
 * Punkte-Tabelle (N-01: LK aufsteigend als zweiter Tiebreaker bei
 * Punktegleichheit).
 */
export type EntryWithLk = RankingEntryRow & { memberLk: number }

export type ApplyResultInput = {
  winnerId: MemberId
  loserId: MemberId
  challengerEntry: RankingEntryRow
  challengedEntry: RankingEntryRow
  allEntries: EntryWithLk[]
  config: RankingConfig
  now: Date
}

export interface RankingStrategy {
  readonly mode: RankingMode

  /** Default-Konfig für eine neue Rangliste in diesem Modus. */
  defaultConfig: () => RankingConfig

  /** Zod-Schema, das die Modus-Config validiert. */
  configSchema: ZodType<RankingConfig>

  /** Anfangs-Reihenfolge — gibt MemberIds in End-Reihenfolge zurück. */
  getInitialOrder: (_input: InitialOrderInput) => MemberId[]

  /** Initial-Werte für die Modus-spezifischen Felder. */
  initialEntryFields: (_member: MemberDto) => InitialEntryFields

  /** UI-Anzeige je Eintrag. */
  getDisplayInfo: (_entry: EntryDisplayInput) => DisplayInfo

  /**
   * Darf der Challenger den Challenged in dieser Rangliste fordern?
   * Modus-spezifische Sprung-Regeln greifen hier.
   */
  validateChallenge: (_input: ValidateChallengeInput) => ValidationResult

  /**
   * Erzeugt die Mutationen, die ein bestätigtes Match-Ergebnis auf die
   * Rangliste anwendet. Die Mutationen werden vom Service in einer
   * Transaktion persistiert.
   */
  applyResult: (_input: ApplyResultInput) => RankingMutation[]
}
