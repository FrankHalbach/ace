import { z } from 'zod'
import type { MemberDto, MemberId } from '../../members'
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

  validateChallenge(_input: ValidateChallengeInput): ValidationResult {
    return { ok: true }
  },

  applyResult(input: ApplyResultInput): RankingMutation[] {
    return applyEloResult(input, DEFAULT_K_FACTOR)
  },
}

/**
 * Berechnet ELO-Updates und sortiert die Rangliste neu. Wird auch von der
 * Hybrid-Strategy genutzt, daher hier als wiederverwendbare Funktion.
 */
export function applyEloResult(input: ApplyResultInput, defaultK: number): RankingMutation[] {
  const { winnerId, loserId, challengerEntry, challengedEntry, allEntries, config, now } = input
  const k = config.kFactor ?? defaultK

  const winnerEntry = winnerId === challengerEntry.memberId ? challengerEntry : challengedEntry
  const loserEntry = loserId === challengerEntry.memberId ? challengerEntry : challengedEntry

  const winnerRating = winnerEntry.eloRating ?? 1500
  const loserRating = loserEntry.eloRating ?? 1500

  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400))
  const newWinnerRating = winnerRating + k * (1 - expectedWinner)
  const newLoserRating = loserRating + k * (0 - (1 - expectedWinner))

  const mutations: RankingMutation[] = [
    { kind: 'set-elo', entryId: winnerEntry.id, eloRating: newWinnerRating },
    { kind: 'set-elo', entryId: loserEntry.id, eloRating: newLoserRating },
    { kind: 'set-last-match', entryId: winnerEntry.id, at: now },
    { kind: 'set-last-match', entryId: loserEntry.id, at: now },
  ]

  // Positionen aus neuen Ratings ableiten
  const newRatings = new Map<number, number>()
  for (const e of allEntries) newRatings.set(e.id, e.eloRating ?? 1500)
  newRatings.set(winnerEntry.id, newWinnerRating)
  newRatings.set(loserEntry.id, newLoserRating)

  const reordered = [...allEntries].sort((a, b) => {
    const ra = newRatings.get(a.id)!
    const rb = newRatings.get(b.id)!
    if (ra !== rb) return rb - ra // höheres Rating = bessere Position
    return a.id - b.id
  })

  reordered.forEach((entry, idx) => {
    const newPos = idx + 1
    if (entry.position !== newPos) {
      mutations.push({ kind: 'set-position', entryId: entry.id, position: newPos })
    }
  })

  return mutations
}
