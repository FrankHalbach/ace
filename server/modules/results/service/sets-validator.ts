import type { MatchMode, SetScore } from '../types'
import { InvalidSetsError } from '../types'

/**
 * Basis-Validierung pro Match-Modus. v1 ist absichtlich liberal:
 * wir prüfen Anzahl der Sätze und dass es einen klaren Sieger pro Satz gibt.
 * Detail-Validierung (Tiebreak-Format genau `10:x`, etc.) folgt später.
 */
export function validateSetsForMode(mode: MatchMode, sets: SetScore[]): void {
  if (sets.length === 0) throw new InvalidSetsError('Mindestens ein Satz erforderlich.')

  // jeder Satz braucht einen Sieger
  for (const [i, set] of sets.entries()) {
    if (set.a === set.b) {
      throw new InvalidSetsError(`Satz ${i + 1}: Unentschieden nicht erlaubt.`)
    }
  }

  switch (mode) {
    case 'pro-set':
      if (sets.length !== 1) throw new InvalidSetsError('Pro-Set: genau ein Satz.')
      break
    case 'two-sets-match-tiebreak':
    case 'best-of-3-tiebreak':
    case 'best-of-3-champions':
    case 'best-of-3-full':
      if (sets.length < 2 || sets.length > 3) {
        throw new InvalidSetsError('Best-of-3 / 2 Sätze + Match-TB: 2 oder 3 Sätze.')
      }
      break
    case 'short-sets-tiebreak':
      if (sets.length < 2 || sets.length > 3) {
        throw new InvalidSetsError('Short-Sets: 2 oder 3 Sätze.')
      }
      break
  }
}

/**
 * Prüft, dass der gemeldete Sieger tatsächlich die Mehrheit der Sätze gewonnen hat.
 * `winnerIsA` = true heißt: Sieger ist Spieler A (im sets-Array `a`).
 */
export function verifyWinnerConsistency(sets: SetScore[], winnerIsA: boolean): void {
  let aWins = 0
  let bWins = 0
  for (const s of sets) {
    if (s.a > s.b) aWins++
    else if (s.b > s.a) bWins++
  }
  const aWonMatch = aWins > bWins
  if (aWonMatch !== winnerIsA) {
    throw new InvalidSetsError(
      `Inkonsistenz: Sieger laut Auswahl stimmt nicht mit den Satz-Gewinnen überein (${aWins}:${bWins}).`,
    )
  }
}
