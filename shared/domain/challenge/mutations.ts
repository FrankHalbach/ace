/**
 * Mutations sind das Daten-Diff, das eine State-Methode produziert.
 * Domain hat KEINE DB-Awareness — die Mutation wird in der Service-
 * Schicht von `applyChallengeMutation` in einer Transaktion persistiert.
 */
import type { ChallengeId } from './types'
import type { DeclineReason } from '../../../server/db/schema/challenge'

export type AcceptChallengeMutation = {
  kind: 'accept-challenge'
  challengeId: ChallengeId
  at: Date
}

export type DeclineChallengeMutation = {
  kind: 'decline-challenge'
  challengeId: ChallengeId
  at: Date
  reason: DeclineReason
  note: string | null
}

export type ExpireChallengeMutation = {
  kind: 'expire-challenge'
  challengeId: ChallengeId
  at: Date
}

export type MarkChallengeCompletedMutation = {
  kind: 'mark-completed'
  challengeId: ChallengeId
  at: Date
}

export type MarkChallengeDisputedMutation = {
  kind: 'mark-disputed'
  challengeId: ChallengeId
  at: Date
}

export type TrainerCancelChallengeMutation = {
  kind: 'trainer-cancel'
  challengeId: ChallengeId
  at: Date
}

export type ChallengeMutation =
  | AcceptChallengeMutation
  | DeclineChallengeMutation
  | ExpireChallengeMutation
  | MarkChallengeCompletedMutation
  | MarkChallengeDisputedMutation
  | TrainerCancelChallengeMutation
