/**
 * Factory: lädt ein Friendly mitsamt Invitees + optionalem Result aus
 * der DB-Sicht und gibt die passende State-Klasse zurück.
 *
 * Wird vom Service-Layer aufgerufen (siehe `loadFriendlyMatch` in
 * `server/modules/friendlies/service/...`).
 */
import {
  AcceptedFriendly,
  CancelledFriendly,
  CompletedFriendly,
  DeclinedFriendly,
  DisputedFriendly,
  PlayedFriendly,
  ProposedFriendly,
  ReportedFriendly,
  type FriendlyMatch,
} from './states'
import type { FriendlyInviteeRow, FriendlyResultRow, FriendlyRow } from './types'

export function friendlyFromRows(
  row: FriendlyRow,
  invitees: ReadonlyArray<FriendlyInviteeRow>,
  result: FriendlyResultRow | null,
): FriendlyMatch {
  const snap = { row, invitees }
  switch (row.status) {
    case 'PROPOSED':
      return new ProposedFriendly(snap)
    case 'CONFIRMED':
      // Result kann schon vorliegen, auch wenn DB-Status noch CONFIRMED ist.
      // (Aktuell wechselt der Status erst beim Confirm/Dispute; bis dahin ist
      // semantisch „Reported" der richtige Modell-Zustand.)
      if (result && result.confirmationStatus === 'pending') {
        return new ReportedFriendly({ ...snap, result })
      }
      return new AcceptedFriendly(snap)
    case 'PLAYED':
      if (result && result.confirmationStatus === 'pending') {
        return new ReportedFriendly({ ...snap, result })
      }
      return new PlayedFriendly(snap)
    case 'DISPUTED':
      if (!result) {
        // sollte nicht vorkommen — DISPUTED ohne Result wäre Datenmüll
        throw new Error(`Friendly ${row.id} ist DISPUTED, hat aber kein Result`)
      }
      return new DisputedFriendly({ ...snap, result })
    case 'COMPLETED':
      if (!result) {
        throw new Error(`Friendly ${row.id} ist COMPLETED, hat aber kein Result`)
      }
      return new CompletedFriendly({ ...snap, result })
    case 'CANCELLED':
      return new CancelledFriendly(snap)
    case 'DECLINED':
      return new DeclinedFriendly(snap)
  }
}
