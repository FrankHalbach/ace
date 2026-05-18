/**
 * Set-Score-Validierung für den einzigen aktuell aktiven Match-Modus
 * `two-sets-match-tiebreak` (Issue #57: vor-Launch-Vereinfachung).
 *
 * Wird von Challenges (`results`) und Friendlies geteilt.
 *
 * Regelübersicht:
 *   - Regulärer Satz:  6:0..6:4, 7:5, 7:6
 *   - Match-Tie-Break: gewinner ≥ 10, |gewinner − verlierer| ≥ 2
 *
 * Aktueller Modus:
 *   - two-sets-match-tiebreak: Sätze 1+2 regulär, Satz 3 (falls vorhanden) Match-TB
 *
 * Weitere Modi (Best-of-3 mit vollem 3. Satz, Kurzsätze, Pro Set) sind als
 * Phase-2-Erweiterung in Issue #58 vorgesehen.
 */

export type SetScore = { a: number; b: number }

export type ScoringMode = 'two-sets-match-tiebreak'

/**
 * Wie das Match endete. Steuert die Validierung mit (Issues #29 / #30):
 *   - regular:    strikt — vollständige, plausible Sätze
 *   - walkover:   `sets` muss leer sein, sonst keine Score-Validierung
 *   - retirement: alle Sätze bis auf den letzten regulär; letzter Satz
 *                 darf unvollständig sein (beide Werte unter Sieg-Schwelle)
 */
export type MatchOutcome = 'regular' | 'walkover' | 'retirement'

export type ValidateOptions = {
  /** Subjekt in Fehlermeldungen — "Sieger" (Challenge) vs "Sieger-Team" (Friendly). */
  winnerSubject?: 'player' | 'team'
  /** Default `regular`. */
  outcome?: MatchOutcome
}

export class InvalidSetsError extends Error {
  readonly code = 'result.invalid-sets' as const
  constructor(message: string) {
    super(message)
  }
}

const REGULAR_FORMAT_HINT = '6:0..6:4, 7:5 oder 7:6'
const MATCH_TIEBREAK_HINT = '≥ 10 mit 2 Punkten Vorsprung (z. B. 10:6, 12:10)'

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

function winnerThreshold(isDecider: boolean): number {
  return isDecider ? 10 : 6
}

function isPartialLastSet(set: SetScore, isDecider: boolean): boolean {
  if (set.a === set.b) return false
  const threshold = winnerThreshold(isDecider)
  return set.a < threshold && set.b < threshold
}

function fmt(set: SetScore): string {
  return `${set.a}:${set.b}`
}

export function validateSetsForMode(
  _mode: ScoringMode,
  sets: SetScore[],
  options: ValidateOptions = {},
): void {
  const outcome: MatchOutcome = options.outcome ?? 'regular'

  if (outcome === 'walkover') {
    if (sets.length !== 0) {
      throw new InvalidSetsError('Walk-Over: kein Score erlaubt — `sets` muss leer sein.')
    }
    return
  }

  if (sets.length === 0) {
    throw new InvalidSetsError('Mindestens ein Satz erforderlich.')
  }

  if (outcome === 'retirement') {
    if (sets.length < 1 || sets.length > 3) {
      throw new InvalidSetsError('Aufgabe: 1 bis 3 Sätze erforderlich.')
    }
  } else {
    if (sets.length < 2 || sets.length > 3) {
      throw new InvalidSetsError('2 oder 3 Sätze erforderlich.')
    }
  }

  for (const [i, set] of sets.entries()) {
    const isDecider = i === 2
    const isLast = i === sets.length - 1

    if (outcome === 'retirement' && isLast) {
      if (set.a === set.b) {
        throw new InvalidSetsError(
          `Satz ${i + 1}: Unentschieden nicht erlaubt (auch bei Aufgabe).`,
        )
      }
      if (isPartialLastSet(set, isDecider)) {
        continue
      }
    } else if (set.a === set.b) {
      throw new InvalidSetsError(`Satz ${i + 1}: Unentschieden nicht erlaubt.`)
    }

    if (isDecider) {
      if (!isMatchTiebreak(set)) {
        throw new InvalidSetsError(
          `Satz ${i + 1} (Match-Tie-Break): ${fmt(set)} ist kein gültiger Match-TB — erwartet ${MATCH_TIEBREAK_HINT}.`,
        )
      }
      continue
    }

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
