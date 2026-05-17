/**
 * Factory: lädt einen Challenge-Row aus der DB-Sicht und gibt die passende
 * State-Klasse zurück.
 */
import {
  AcceptedChallenge,
  CancelledChallenge,
  CompletedChallenge,
  DeclinedChallenge,
  DisputedChallenge,
  ExpiredChallenge,
  ProposedChallenge,
  type ChallengeMatch,
} from './states'
import type { ChallengeRow } from './types'

export function challengeFromRow(row: ChallengeRow): ChallengeMatch {
  const snap = { row }
  switch (row.status) {
    case 'PROPOSED':
      return new ProposedChallenge(snap)
    case 'ACCEPTED':
      return new AcceptedChallenge(snap)
    case 'DISPUTED':
      return new DisputedChallenge(snap)
    case 'COMPLETED':
      return new CompletedChallenge(snap)
    case 'CANCELLED':
      return new CancelledChallenge(snap)
    case 'DECLINED':
      return new DeclinedChallenge(snap)
    case 'EXPIRED':
      return new ExpiredChallenge(snap)
  }
}
