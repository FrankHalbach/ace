import { z } from 'zod'
import type { MemberId, MemberDto } from '../../members'
import type {
  ApplyResultInput,
  DisplayInfo,
  EntryDisplayInput,
  InitialEntryFields,
  InitialOrderInput,
  RankingMutation,
  RankingStrategy,
  ValidateChallengeInput,
  ValidationResult,
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

  validateChallenge(input: ValidateChallengeInput): ValidationResult {
    const { challengerEntry, challengedEntry, config } = input
    // Challenger ist niedriger gerankt (höhere position-Nummer), darf nach oben fordern.
    if (challengerEntry.position <= challengedEntry.position) {
      return {
        ok: false,
        code: 'jump-not-allowed',
        reason: 'Du kannst nur Spieler über dir fordern.',
      }
    }
    const distance = challengerEntry.position - challengedEntry.position
    const maxJumpUp = config.maxJumpUp ?? DEFAULT_MAX_JUMP_UP
    if (distance > maxJumpUp) {
      return {
        ok: false,
        code: 'jump-not-allowed',
        reason: `Maximal ${maxJumpUp} Plätze nach oben (du bist ${distance} entfernt).`,
      }
    }
    return { ok: true }
  },

  applyResult(input: ApplyResultInput): RankingMutation[] {
    const { winnerId, challengerEntry, challengedEntry, allEntries, now } = input
    const mutations: RankingMutation[] = [
      { kind: 'set-last-match', entryId: challengerEntry.id, at: now },
      { kind: 'set-last-match', entryId: challengedEntry.id, at: now },
    ]

    if (winnerId !== challengerEntry.memberId) {
      // Challenged hat gewonnen → keine Positions-Änderung
      return mutations
    }

    // Challenger hat gewonnen → übernimmt Challenged-Position, alle dazwischen
    // (inkl. Challenged) rutschen einen Platz nach unten.
    const oldChallengerPos = challengerEntry.position
    const newChallengerPos = challengedEntry.position

    for (const entry of allEntries) {
      if (entry.id === challengerEntry.id) {
        mutations.push({ kind: 'set-position', entryId: entry.id, position: newChallengerPos })
      } else if (entry.position >= newChallengerPos && entry.position < oldChallengerPos) {
        mutations.push({ kind: 'set-position', entryId: entry.id, position: entry.position + 1 })
      }
    }
    return mutations
  },
}

function byLkThenId(a: MemberDto, b: MemberDto): number {
  if (a.dtbLk !== b.dtbLk) return a.dtbLk - b.dtbLk
  return a.id - b.id
}
