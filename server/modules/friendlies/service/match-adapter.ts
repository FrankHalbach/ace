/**
 * Bridge zwischen Domain (`shared/domain/friendly/`) und Persistierung.
 *
 * Service-Methoden:
 *   const match = loadFriendlyMatch(id)               ← lädt + dispatcht in State-Klasse
 *   if (!(match instanceof AcceptedFriendly)) ...      ← Type-Narrowing
 *   const mutation = match.cancel(actor, now)         ← Domain-Befehl
 *   applyFriendlyMutation(mutation)                   ← Persistiert atomisch
 */
import { useDb } from '../../../db'
import { friendly } from '../../../db/schema/friendly'
import { friendlyInvitee } from '../../../db/schema/friendly-invitee'
import { friendlyResult } from '../../../db/schema/friendly-result'
import { member } from '../../../db/schema/member'
import { and, eq, inArray } from 'drizzle-orm'
import { friendlyFromRows } from '../../../../shared/domain/friendly/factory'
import type { FriendlyMatch, FriendlyMutation } from '../../../../shared/domain/friendly'
import type { FriendlyId } from '../../../db/schema/friendly'
import { FriendlyNotFoundError } from '../types'
import { friendlyRepo } from '../repository/friendly-repo'
import { friendlyInviteeRepo } from '../repository/friendly-invitee-repo'
import { friendlyResultRepo } from '../repository/friendly-result-repo'

/**
 * Lädt Row + Invitees + (optional) Result und dispatcht in die richtige
 * State-Klasse. Wirft `FriendlyNotFoundError`, wenn die ID unbekannt ist.
 */
export function loadFriendlyMatch(id: FriendlyId): FriendlyMatch {
  const row = friendlyRepo.findById(id)
  if (!row) throw new FriendlyNotFoundError(id)
  const invitees = friendlyInviteeRepo.listByFriendly(id)
  const result = friendlyResultRepo.findByFriendly(id) ?? null
  return friendlyFromRows(row, invitees, result)
}

/**
 * Wendet eine Domain-Mutation atomar auf die DB an. Cross-Aggregate-
 * Side-Effects (z. B. `member.last_friendly_at`) werden hier ebenfalls
 * mit-gepatcht — das Domain produziert die Liste der betroffenen
 * Mitglieder, der Service kümmert sich um den UPDATE.
 */
export function applyFriendlyMutation(mutation: FriendlyMutation): void {
  const db = useDb()
  db.transaction((tx) => {
    switch (mutation.kind) {
      case 'accept-invitee': {
        tx.update(friendlyInvitee)
          .set({ status: 'accepted', respondedAt: mutation.at })
          .where(eq(friendlyInvitee.id, mutation.inviteeId))
          .run()
        if (mutation.alsoConfirmFriendly) {
          tx.update(friendly)
            .set({ status: 'CONFIRMED', confirmedAt: mutation.at })
            .where(eq(friendly.id, mutation.friendlyId))
            .run()
        }
        break
      }
      case 'decline-invitee': {
        tx.update(friendlyInvitee)
          .set({ status: 'declined', respondedAt: mutation.at })
          .where(eq(friendlyInvitee.id, mutation.inviteeId))
          .run()
        tx.update(friendly)
          .set({ status: 'DECLINED', declinedAt: mutation.at })
          .where(eq(friendly.id, mutation.friendlyId))
          .run()
        break
      }
      case 'cancel-friendly': {
        tx.update(friendly)
          .set({ status: 'CANCELLED', cancelledAt: mutation.at })
          .where(eq(friendly.id, mutation.friendlyId))
          .run()
        break
      }
      case 'mark-played': {
        tx.update(friendly)
          .set({ status: 'PLAYED', playedAt: mutation.at })
          .where(eq(friendly.id, mutation.friendlyId))
          .run()
        tx.update(member)
          .set({ lastFriendlyAt: mutation.at })
          .where(inArray(member.id, mutation.participantIds))
          .run()
        break
      }
      case 'report-result': {
        tx.insert(friendlyResult).values(mutation.insert).run()
        // Status-Transition CONFIRMED → PLAYED bei Result-Report, falls
        // noch nicht PLAYED. Damit ist #47-Symptom „Status bleibt Bestätigt"
        // gefixed: spätestens beim Meldungs-Submit transitioniert das Friendly.
        tx.update(friendly)
          .set({ status: 'PLAYED', playedAt: mutation.insert.reportedAt })
          .where(and(eq(friendly.id, mutation.friendlyId), eq(friendly.status, 'CONFIRMED')))
          .run()
        break
      }
      case 'confirm-result': {
        tx.update(friendlyResult)
          .set({
            confirmationStatus: 'confirmed',
            confirmedAt: mutation.at,
            confirmedBy: mutation.confirmedBy,
          })
          .where(eq(friendlyResult.id, mutation.resultId))
          .run()
        tx.update(friendly)
          .set({ status: 'COMPLETED', completedAt: mutation.at })
          .where(eq(friendly.id, mutation.friendlyId))
          .run()
        tx.update(member)
          .set({ lastFriendlyAt: mutation.at })
          .where(inArray(member.id, mutation.participantIds))
          .run()
        break
      }
      case 'dispute-result': {
        tx.update(friendlyResult)
          .set({
            confirmationStatus: 'disputed',
            disputedAt: mutation.at,
            disputeNote: mutation.note,
          })
          .where(eq(friendlyResult.id, mutation.resultId))
          .run()
        tx.update(friendly)
          .set({ status: 'DISPUTED', disputedAt: mutation.at })
          .where(eq(friendly.id, mutation.friendlyId))
          .run()
        break
      }
      case 'trainer-force-confirm': {
        tx.update(friendlyResult)
          .set({
            confirmationStatus: 'confirmed',
            confirmedAt: mutation.at,
          })
          .where(eq(friendlyResult.id, mutation.resultId))
          .run()
        tx.update(friendly)
          .set({ status: 'COMPLETED', completedAt: mutation.at })
          .where(eq(friendly.id, mutation.friendlyId))
          .run()
        tx.update(member)
          .set({ lastFriendlyAt: mutation.at })
          .where(inArray(member.id, mutation.participantIds))
          .run()
        break
      }
      case 'trainer-cancel': {
        tx.update(friendly)
          .set({ status: 'CANCELLED', cancelledAt: mutation.at })
          .where(eq(friendly.id, mutation.friendlyId))
          .run()
        break
      }
    }
  })
}

