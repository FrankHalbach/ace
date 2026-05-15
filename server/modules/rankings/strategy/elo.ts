import { z } from 'zod'
import type { MemberDto, MemberId } from '../../members'
import type {
  DisplayInfo,
  EntryDisplayInput,
  InitialEntryFields,
  InitialOrderInput,
  RankingStrategy,
} from './types'

const DEFAULT_INITIAL_RATING = 1500
const DEFAULT_K_FACTOR = 32

export const eloStrategy: RankingStrategy = {
  mode: 'elo',

  defaultConfig() {
    return { kFactor: DEFAULT_K_FACTOR }
  },

  configSchema: z.object({
    kFactor: z.number().int().min(1).max(100).default(DEFAULT_K_FACTOR),
  }),

  /**
   * ELO ignoriert Übergangs-Strategien aus FR-15a — die Position folgt
   * dem Rating, und das Rating beginnt einheitlich bei DEFAULT_INITIAL_RATING.
   * Tiebreaker: LK aufsteigend, dann MemberId.
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
    return { points: null, eloRating: DEFAULT_INITIAL_RATING }
  },

  getDisplayInfo(entry: EntryDisplayInput): DisplayInfo {
    return {
      primary: `#${entry.position}`,
      secondary: entry.eloRating !== null ? `${Math.round(entry.eloRating)} ELO` : undefined,
    }
  },
}
