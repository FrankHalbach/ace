/**
 * Mutations sind das Daten-Diff, das eine State-Methode produziert.
 * Domain hat KEINE DB-Awareness — die Mutation wird in der Service-
 * Schicht von `applyFriendlyMutation` in einer Transaktion persistiert.
 */
import type { FriendlyId, FriendlyResultRow, MemberId } from './types'
import type { FriendlyInviteeId } from '../../../server/db/schema/friendly-invitee'
import type { FriendlyResultId } from '../../../server/db/schema/friendly-result'
import type { FriendlyStatus, FriendlyMatchMode } from '../../../server/db/schema/friendly'
import type { MatchOutcome, SetScore } from '../../match-scoring'

export type AcceptInviteeMutation = {
  kind: 'accept-invitee'
  friendlyId: FriendlyId
  inviteeId: FriendlyInviteeId
  at: Date
  /** Wenn nach diesem Accept alle Eingeladenen akzeptiert haben → CONFIRMED. */
  alsoConfirmFriendly: boolean
}

export type DeclineInviteeMutation = {
  kind: 'decline-invitee'
  friendlyId: FriendlyId
  inviteeId: FriendlyInviteeId
  at: Date
  /** Eine Absage kippt das ganze Friendly auf DECLINED. */
  alsoDeclineFriendly: true
}

export type CancelFriendlyMutation = {
  kind: 'cancel-friendly'
  friendlyId: FriendlyId
  at: Date
}

export type MarkPlayedMutation = {
  kind: 'mark-played'
  friendlyId: FriendlyId
  at: Date
  /** Wer wurde dabei „mark als gespielt"-gestempelt — fürs last_friendly_at. */
  participantIds: MemberId[]
}

export type ReportResultMutation = {
  kind: 'report-result'
  friendlyId: FriendlyId
  insert: {
    friendlyId: FriendlyId
    winnerMemberIds: MemberId[]
    sets: SetScore[]
    matchMode: FriendlyMatchMode
    reportedAt: Date
    reportedBy: MemberId
    confirmationStatus: 'pending'
    outcome: MatchOutcome
    outcomeNote: string | null
  }
}

export type ConfirmResultMutation = {
  kind: 'confirm-result'
  friendlyId: FriendlyId
  resultId: FriendlyResultId
  confirmedBy: MemberId
  at: Date
  /** Beim Confirm wird Friendly auf COMPLETED gesetzt + last_friendly_at gestempelt. */
  participantIds: MemberId[]
}

export type DisputeResultMutation = {
  kind: 'dispute-result'
  friendlyId: FriendlyId
  resultId: FriendlyResultId
  at: Date
  note: string
}

export type TrainerForceConfirmMutation = {
  kind: 'trainer-force-confirm'
  friendlyId: FriendlyId
  resultId: FriendlyResultId
  at: Date
  participantIds: MemberId[]
}

export type TrainerCancelMutation = {
  kind: 'trainer-cancel'
  friendlyId: FriendlyId
  at: Date
  /** Von welchem State weg — `CancelledFriendly` wird's. */
  fromStatus: FriendlyStatus
}

export type FriendlyMutation =
  | AcceptInviteeMutation
  | DeclineInviteeMutation
  | CancelFriendlyMutation
  | MarkPlayedMutation
  | ReportResultMutation
  | ConfirmResultMutation
  | DisputeResultMutation
  | TrainerForceConfirmMutation
  | TrainerCancelMutation

export type { FriendlyResultRow }
