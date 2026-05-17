/**
 * Domain-Types für das `Challenge`-Aggregat. Server- und Client-tauglich
 * (keine Drizzle-/Server-only-Imports auf Runtime-Ebene).
 */
import type { ChallengeId, ChallengeRow } from '../../../server/db/schema/challenge'
import type { MemberId } from '../../../server/db/schema/member'

export type { ChallengeId, ChallengeRow, MemberId }

/** Wer führt die Aktion aus? */
export type Actor = {
  memberId: MemberId
  isTrainer: boolean
}

/** Snapshot, mit dem jede State-Klasse intern arbeitet. */
export type ChallengeSnapshot = {
  readonly row: ChallengeRow
}

/** Optionaler Patch — Decline trägt Grund und Notiz mit. */
export type DeclineInput = {
  reason: 'injury' | 'vacation' | 'work' | 'other'
  note: string | null
}
