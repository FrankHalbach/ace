import type { ZodType } from 'zod'
import type { MemberDto, MemberId } from '../../members'
import type { RankingConfig, RankingMode } from '../../../db/schema/ranking'

export type { RankingConfig, RankingMode }

/** Verfügbare Saison-Übergangs-Strategien (FR-15a). */
export type TransitionStrategy = 'takeover' | 'reset' | 'softened'

/**
 * Eingabe für `getInitialOrder` einer Rangliste.
 * `previousEntries` ist die End-Reihenfolge der Vorgänger-Saison-Rangliste
 * (sortiert nach position aufsteigend) — leer, wenn es keine Vorgängerin gibt.
 */
export type InitialOrderInput = {
  members: MemberDto[]
  transition: TransitionStrategy
  previousEntries?: { memberId: MemberId; position: number }[]
}

/** Initial-Werte für die Modus-spezifischen Felder eines RankingEntry. */
export type InitialEntryFields = {
  points?: number | null
  eloRating?: number | null
}

/** Was im UI je Eintrag rechts neben dem Namen erscheint. */
export type DisplayInfo = {
  primary: string
  secondary?: string
}

/** Subset eines RankingEntry, das fürs Display reicht. */
export type EntryDisplayInput = {
  position: number
  points: number | null
  eloRating: number | null
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
}
