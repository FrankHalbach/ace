import { z } from 'zod'
import type { MemberId, MemberDto } from '../../members'
import type {
  DisplayInfo,
  EntryDisplayInput,
  InitialEntryFields,
  InitialOrderInput,
  RankingStrategy,
} from './types'

const DEFAULT_MAX_JUMP_UP = 3
const TOP_X_FIXED_IN_SOFTENED = 5

export const pyramidStrategy: RankingStrategy = {
  mode: 'pyramid',

  defaultConfig() {
    return { maxJumpUp: DEFAULT_MAX_JUMP_UP }
  },

  configSchema: z.object({
    maxJumpUp: z.number().int().min(1).max(20).default(DEFAULT_MAX_JUMP_UP),
  }),

  /**
   * Initial-Reihenfolge:
   *   - reset: alle nach LK aufsteigend (1.0 ist stärker)
   *   - takeover: Vorgänger-Position übernehmen, neue Mitglieder ans Ende nach LK
   *   - softened: Top-5 aus Vorgänger fix, Rest nach LK
   */
  getInitialOrder(input: InitialOrderInput): MemberId[] {
    const { members, transition, previousEntries = [] } = input

    if (transition === 'reset' || previousEntries.length === 0) {
      return [...members].sort(byLkThenId).map((m) => m.id)
    }

    if (transition === 'takeover') {
      const ordered = previousEntries
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((e) => e.memberId)
      const seen = new Set(ordered)
      const newcomers = members.filter((m) => !seen.has(m.id)).sort(byLkThenId).map((m) => m.id)
      return [...ordered, ...newcomers]
    }

    // softened
    const top = previousEntries
      .filter((e) => e.position <= TOP_X_FIXED_IN_SOFTENED)
      .sort((a, b) => a.position - b.position)
      .map((e) => e.memberId)
    const topSet = new Set(top)
    const rest = members.filter((m) => !topSet.has(m.id)).sort(byLkThenId).map((m) => m.id)
    return [...top, ...rest]
  },

  initialEntryFields(_member: MemberDto): InitialEntryFields {
    return { points: null, eloRating: null }
  },

  getDisplayInfo(entry: EntryDisplayInput): DisplayInfo {
    return { primary: `#${entry.position}` }
  },
}

function byLkThenId(a: MemberDto, b: MemberDto): number {
  if (a.dtbLk !== b.dtbLk) return a.dtbLk - b.dtbLk
  return a.id - b.id
}
