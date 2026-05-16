/**
 * Set-Score-Validierung pro Match-Modus (ITF Rules of Tennis Rule 5 + DTB-Praxis).
 *
 * Wird von Challenges (`results`) und Friendlies geteilt. Frühere Liberal-
 * Validation (nur Anzahl Sätze) ist abgelöst durch strikte Plausi-Checks
 * (Issues #26 A1, #27 A2, #28 A3).
 *
 * Regelübersicht:
 *   - Regulärer Satz:      6:0..6:4, 7:5, 7:6
 *   - Match-Tie-Break:     gewinner ≥ 10, |gewinner − verlierer| ≥ 2
 *   - Short-Set (Tie-Break): 4:0..4:2, 5:3, 5:4
 *   - Pro-Set (Länge L):   L:0..L:L-2, L+1:L (Tie-Break bei L:L)
 *
 * In welchem Modus welche Satzform an welcher Position erlaubt ist:
 *   - two-sets-match-tiebreak: Sätze 1+2 regulär, Satz 3 (falls vorhanden) Match-TB
 *   - best-of-3-tiebreak:      alle Sätze regulär
 *   - best-of-3-full:          alle Sätze regulär
 *   - best-of-3-champions:     Sätze 1+2 regulär, Satz 3 (falls vorhanden) Match-TB
 *   - short-sets-tiebreak:     alle Sätze Short-Set
 *   - pro-set:                 ein Pro-Set
 */

export type SetScore = { a: number; b: number }

export type ScoringMode =
  | 'two-sets-match-tiebreak'
  | 'best-of-3-tiebreak'
  | 'best-of-3-full'
  | 'best-of-3-champions'
  | 'short-sets-tiebreak'
  | 'pro-set'

export type ProSetLength = 8 | 9

export type ValidateOptions = {
  /** Default 8 — wird aus `Season.config.proSetLength` durchgereicht. */
  proSetLength?: ProSetLength
  /** Subjekt in Fehlermeldungen — "Sieger" (Challenge) vs "Sieger-Team" (Friendly). */
  winnerSubject?: 'player' | 'team'
}

export class InvalidSetsError extends Error {
  readonly code = 'result.invalid-sets' as const
  constructor(message: string) {
    super(message)
  }
}

const REGULAR_FORMAT_HINT = '6:0..6:4, 7:5 oder 7:6'
const MATCH_TIEBREAK_HINT = '≥ 10 mit 2 Punkten Vorsprung (z. B. 10:6, 12:10)'
const SHORT_SET_HINT = '4:0..4:2, 5:3 oder 5:4'

function isRegularSet({ a, b }: SetScore): boolean {
  const max = Math.max(a, b)
  const min = Math.min(a, b)
  if (max === 6) return min >= 0 && min <= 4
  if (max === 7) return min === 5 || min === 6
  return false
}

function isMatchTiebreak({ a, b }: SetScore): boolean {
  const max = Math.max(a, b)
  const min = Math.min(a, b)
  return max >= 10 && max - min >= 2
}

function isShortSet({ a, b }: SetScore): boolean {
  const max = Math.max(a, b)
  const min = Math.min(a, b)
  if (max === 4) return min >= 0 && min <= 2
  if (max === 5) return min === 3 || min === 4
  return false
}

function isProSet({ a, b }: SetScore, length: ProSetLength): boolean {
  const max = Math.max(a, b)
  const min = Math.min(a, b)
  if (max === length) return min >= 0 && min <= length - 2
  if (max === length + 1) return min === length
  return false
}

function proSetHint(length: ProSetLength): string {
  return `${length}:0..${length}:${length - 2} oder ${length + 1}:${length}`
}

function fmt(set: SetScore): string {
  return `${set.a}:${set.b}`
}

export function validateSetsForMode(
  mode: ScoringMode,
  sets: SetScore[],
  options: ValidateOptions = {},
): void {
  if (sets.length === 0) {
    throw new InvalidSetsError('Mindestens ein Satz erforderlich.')
  }

  // Anzahl der Sätze pro Modus
  switch (mode) {
    case 'pro-set':
      if (sets.length !== 1) throw new InvalidSetsError('Pro-Set: genau ein Satz.')
      break
    case 'two-sets-match-tiebreak':
    case 'best-of-3-tiebreak':
    case 'best-of-3-full':
    case 'best-of-3-champions':
    case 'short-sets-tiebreak':
      if (sets.length < 2 || sets.length > 3) {
        throw new InvalidSetsError('2 oder 3 Sätze erforderlich.')
      }
      break
  }

  // Unentschieden ausschließen
  for (const [i, set] of sets.entries()) {
    if (set.a === set.b) {
      throw new InvalidSetsError(`Satz ${i + 1}: Unentschieden nicht erlaubt.`)
    }
  }

  // Format-Check pro Satz, abhängig von Modus und Position
  for (const [i, set] of sets.entries()) {
    const isDecider = i === 2 // dritter Satz, falls vorhanden
    const expectMatchTb =
      isDecider && (mode === 'two-sets-match-tiebreak' || mode === 'best-of-3-champions')

    if (expectMatchTb) {
      if (!isMatchTiebreak(set)) {
        throw new InvalidSetsError(
          `Satz ${i + 1} (Match-Tie-Break): ${fmt(set)} ist kein gültiger Match-TB — erwartet ${MATCH_TIEBREAK_HINT}.`,
        )
      }
      continue
    }

    if (mode === 'short-sets-tiebreak') {
      if (!isShortSet(set)) {
        throw new InvalidSetsError(
          `Satz ${i + 1} (Short-Set): ${fmt(set)} ist kein gültiger Score — erwartet ${SHORT_SET_HINT}.`,
        )
      }
      continue
    }

    if (mode === 'pro-set') {
      const length = options.proSetLength ?? 8
      if (!isProSet(set, length)) {
        throw new InvalidSetsError(
          `Pro-Set: ${fmt(set)} ist kein gültiger Score — erwartet ${proSetHint(length)} (Länge ${length}).`,
        )
      }
      continue
    }

    // Default: regulärer Satz
    if (!isRegularSet(set)) {
      throw new InvalidSetsError(
        `Satz ${i + 1}: ${fmt(set)} ist kein gültiger Score — erwartet ${REGULAR_FORMAT_HINT}.`,
      )
    }
  }
}

/**
 * Prüft, dass der gemeldete Sieger tatsächlich die Mehrheit der Sätze gewonnen
 * hat. `winnerIsA = true` heißt: Sieger ist Spielfeld-Seite A.
 */
export function verifyWinnerConsistency(
  sets: SetScore[],
  winnerIsA: boolean,
  options: ValidateOptions = {},
): void {
  let aWins = 0
  let bWins = 0
  for (const s of sets) {
    if (s.a > s.b) aWins++
    else if (s.b > s.a) bWins++
  }
  const aWonMatch = aWins > bWins
  if (aWonMatch !== winnerIsA) {
    const subject = options.winnerSubject === 'team' ? 'Sieger-Team' : 'Sieger'
    throw new InvalidSetsError(
      `Inkonsistenz: ${subject} stimmt nicht mit den Satz-Gewinnen überein (${aWins}:${bWins}).`,
    )
  }
}
