import { z } from 'zod'
import type { MemberDto, MemberId } from '../../members'
import type {
  DisplayInfo,
  EntryDisplayInput,
  InitialEntryFields,
  InitialOrderInput,
  RankingStrategy,
} from './types'

/**
 * Default-Punktwerte aus N-01 (Spec-Nachtrag „Punkte-Tabelle als zusätzlicher
 * Wertungs-Modus").
 */
const DEFAULT_POINT_VALUES = {
  challengeWin: 3,
  challengeLoss: 1,
  friendlyWin: 2,
  friendlyLoss: 1,
  friendlyNoResult: 1,
  walkoverWin: 2,
  diversityBonus: 1,
}

const pointValuesSchema = z.object({
  challengeWin: z.number().int().min(0).max(20),
  challengeLoss: z.number().int().min(0).max(20),
  friendlyWin: z.number().int().min(0).max(20),
  friendlyLoss: z.number().int().min(0).max(20),
  friendlyNoResult: z.number().int().min(0).max(20),
  walkoverWin: z.number().int().min(0).max(20),
  diversityBonus: z.number().int().min(0).max(20),
})

export const pointsTableStrategy: RankingStrategy = {
  mode: 'points-table',

  defaultConfig() {
    return { pointValues: { ...DEFAULT_POINT_VALUES } }
  },

  configSchema: z.object({
    pointValues: pointValuesSchema.default(DEFAULT_POINT_VALUES),
  }),

  /**
   * Punkte-Tabelle: alle starten bei 0 Punkten. Initial-Reihenfolge ergibt
   * sich nach LK aufsteigend (Tiebreaker). Übergangs-Strategien aus FR-15a
   * werden ignoriert — Punkte beginnen jede Saison frisch.
   */
  getInitialOrder(input: InitialOrderInput): MemberId[] {
    return [...input.members]
      .sort((a, b) => {
        if (a.dtbLk !== b.dtbLk) return a.dtbLk - b.dtbLk
        return a.id - b.id
      })
      .map((m) => m.id)
  },

  initialEntryFields(_member: MemberDto): InitialEntryFields {
    return { points: 0, eloRating: null }
  },

  getDisplayInfo(entry: EntryDisplayInput): DisplayInfo {
    return {
      primary: `${entry.points ?? 0} Pkt`,
      secondary: `#${entry.position}`,
    }
  },
}
