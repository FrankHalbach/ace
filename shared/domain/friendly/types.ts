/**
 * Domain-Types für das `Friendly`-Aggregat. Server- und Client-tauglich
 * (keine Drizzle-/Server-only-Imports).
 */
import type { FriendlyId, FriendlyRow } from '../../../server/db/schema/friendly'
import type { FriendlyInviteeRow } from '../../../server/db/schema/friendly-invitee'
import type { FriendlyResultRow } from '../../../server/db/schema/friendly-result'
import type { MemberId } from '../../../server/db/schema/member'

export type { FriendlyId, FriendlyRow, FriendlyInviteeRow, FriendlyResultRow, MemberId }

/**
 * Wer führt die Aktion aus? — Domain unterscheidet nicht zwischen
 * „Initiator" und „beliebiger Mitglied", sondern stellt das aus
 * Aktor + Aggregat-Inhalt fest.
 */
export type Actor = {
  memberId: MemberId
  isTrainer: boolean
}

/**
 * Snapshot, mit dem jede State-Klasse intern arbeitet. Beinhaltet das
 * Friendly-Row und seine Eingeladenen — für ReportedFriendly auch das
 * Result-Row.
 */
export type FriendlySnapshot = {
  readonly row: FriendlyRow
  readonly invitees: ReadonlyArray<FriendlyInviteeRow>
}

export type FriendlyWithResultSnapshot = FriendlySnapshot & {
  readonly result: FriendlyResultRow
}
