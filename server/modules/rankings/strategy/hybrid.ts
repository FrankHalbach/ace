import { z } from 'zod'
import type { MemberDto, MemberId } from '../../members'
import { applyEloResult } from './elo'
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

const DEFAULT_INITIAL_RATING = 1500
const DEFAULT_K_FACTOR = 16
const DEFAULT_MAX_JUMP_UP = 3

export const hybridStrategy: RankingStrategy = {
  mode: 'hybrid',

  defaultConfig() {
    return { maxJumpUp: DEFAULT_MAX_JUMP_UP, kFactor: DEFAULT_K_FACTOR }
  },

  configSchema: z.object({
    maxJumpUp: z.number().int().min(1).max(20).default(DEFAULT_MAX_JUMP_UP),
    kFactor: z.number().int().min(1).max(100).default(DEFAULT_K_FACTOR),
  }),

  /**
   * Hybrid: Position-Tausch wie Pyramide, Rating-Tracking wie ELO. Beim
   * Saison-Start startet das Rating einheitlich, die Position folgt LK.
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

  /**
   * Sprung-Distanz prüfen wie Pyramide.
   */
  validateChallenge(input: ValidateChallengeInput): ValidationResult {
    const { challengerEntry, challengedEntry, config } = input
    if (challengerEntry.position <= challengedEntry.position) {
      return { ok: false, code: 'jump-not-allowed', reason: 'Nur nach oben fordern.' }
    }
    const distance = challengerEntry.position - challengedEntry.position
    const maxJumpUp = config.maxJumpUp ?? DEFAULT_MAX_JUMP_UP
    if (distance > maxJumpUp) {
      return {
        ok: false,
        code: 'jump-not-allowed',
        reason: `Maximal ${maxJumpUp} Plätze nach oben.`,
      }
    }
    return { ok: true }
  },

  /**
   * Hybrid: ELO-Update + Positionen neu sortieren nach Rating (wie ELO-Strategy).
   * Optional könnten wir hier auch Position-Tausch wie Pyramide implementieren —
   * für v1 ist Rating-getriebene Position konsistenter.
   */
  applyResult(input: ApplyResultInput): RankingMutation[] {
    return applyEloResult(input, DEFAULT_K_FACTOR)
  },
}
