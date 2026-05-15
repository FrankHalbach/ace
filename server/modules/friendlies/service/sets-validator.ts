import { InvalidSetsError, type FriendlyMatchMode, type SetScore } from '../types'

/**
 * Basis-Validierung pro Match-Modus. Bewusst liberal: prüft Anzahl der Sätze
 * und dass jeder Satz einen klaren Sieger hat. Detail-Validierung
 * (Tiebreak-Format genau `10:x`, etc.) folgt später.
 *
 * Inhaltlich identisch zu `results/service/sets-validator.ts` — wenn diese
 * Logik einmal mehr braucht (z. B. Punkte-Skalierung pro Modus), wandert sie
 * nach `server/shared/`.
 */
export function validateSetsForMode(mode: FriendlyMatchMode, sets: SetScore[]): void {
  if (sets.length === 0) throw new InvalidSetsError('Mindestens ein Satz erforderlich.')

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
 * Prüft, dass das gemeldete Sieger-Team tatsächlich die Mehrheit der Sätze
 * gewonnen hat. `winnerIsA = true` heißt: Sieger-Team ist Spielfeld-Seite A
 * (im sets-Array `a`).
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
      `Inkonsistenz: Sieger-Team passt nicht zu den Satz-Gewinnen (${aWins}:${bWins}).`,
    )
  }
}
