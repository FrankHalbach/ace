import type { ChallengeId, DeclineReason } from '../challenges'
import type { FriendlyFormat, FriendlyId, FriendlyResultId } from '../friendlies'
import type { MemberId, NotificationKey } from '../members'
import type { MatchResultId } from '../results'

export type { NotificationKey }

/**
 * Discriminated-Union aller FR-70-Events.
 *
 * Jeder Event wird von einer Service-Mutation gefeuert, einer pro Empfänger.
 * Die Felder im Event sind so gewählt, dass der Dispatcher zum Rendern nur
 * Member-Daten (über `profileService.findRecipient`) braucht — niemals
 * zurück in das Challenge-/Friendly-/Results-Modul. Damit bleibt der
 * Modul-Graph azyklisch.
 *
 * Wo möglich, übergibt der Caller Daten, die er ohnehin in der Hand hat
 * (Format, scheduledAt, rankingName), statt das notifications-Modul
 * nachladen zu lassen.
 */
export type NotificationEvent =
  | {
      key: 'challenge.received'
      recipientId: MemberId
      challengeId: ChallengeId
      challengerId: MemberId
      rankingName: string
    }
  | {
      key: 'challenge.accepted'
      recipientId: MemberId
      challengeId: ChallengeId
      accepterId: MemberId
      rankingName: string
    }
  | {
      key: 'challenge.declined'
      recipientId: MemberId
      challengeId: ChallengeId
      declinerId: MemberId
      rankingName: string
      reason: DeclineReason | null
      note: string | null
    }
  | {
      key: 'challenge.expired'
      recipientId: MemberId
      challengeId: ChallengeId
      counterpartyId: MemberId
      rankingName: string
      role: 'challenger' | 'challenged'
    }
  | {
      key: 'challenge.result_reported'
      recipientId: MemberId
      challengeId: ChallengeId
      resultId: MatchResultId
      reporterId: MemberId
    }
  | {
      key: 'challenge.result_confirmed'
      recipientId: MemberId
      challengeId: ChallengeId
      resultId: MatchResultId
      confirmerId: MemberId
    }
  | {
      key: 'challenge.result_disputed'
      recipientId: MemberId
      challengeId: ChallengeId
      resultId: MatchResultId
      disputerId: MemberId | null  // null bei Cron-Auto-Dispute
      auto: boolean
    }
  | {
      key: 'friendly.invited'
      recipientId: MemberId
      friendlyId: FriendlyId
      initiatorId: MemberId
      format: FriendlyFormat
      scheduledAt: Date
    }
  | {
      key: 'friendly.accepted'
      recipientId: MemberId
      friendlyId: FriendlyId
      responderId: MemberId
      scheduledAt: Date
    }
  | {
      key: 'friendly.declined'
      recipientId: MemberId
      friendlyId: FriendlyId
      responderId: MemberId
      scheduledAt: Date
    }
  | {
      key: 'friendly.cancelled'
      recipientId: MemberId
      friendlyId: FriendlyId
      initiatorId: MemberId
      scheduledAt: Date
    }
  | {
      key: 'friendly.result_reported'
      recipientId: MemberId
      friendlyId: FriendlyId
      resultId: FriendlyResultId
      reporterId: MemberId
    }
  | {
      key: 'friendly.result_confirmed'
      recipientId: MemberId
      friendlyId: FriendlyId
      resultId: FriendlyResultId
      confirmerId: MemberId
    }
  | {
      key: 'friendly.result_disputed'
      recipientId: MemberId
      friendlyId: FriendlyId
      resultId: FriendlyResultId
      disputerId: MemberId | null
      auto: boolean
    }

export type RenderedEmail = { subject: string; html: string; text: string }
