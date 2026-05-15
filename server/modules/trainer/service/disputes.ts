import { challengesService, type ChallengeId } from '../../challenges'
import {
  friendliesService,
  friendlyResultsService,
  type FriendlyId,
  type FriendlyResultId,
} from '../../friendlies'
import { resultsService, type MatchResultId } from '../../results'
import { DisputeNotFoundError, type DisputeListItem } from '../types'

export const trainerDisputesService = {
  /**
   * Liste aller offenen Streitfälle — Challenges und Friendlies im Status DISPUTED.
   * Sortiert nach disputedAt absteigend (jüngster Streit zuerst).
   */
  list(): DisputeListItem[] {
    const items: DisputeListItem[] = []

    for (const c of challengesService.listDisputed()) {
      const result = resultsService.findForChallenge(c.id)
      items.push({
        kind: 'challenge',
        challengeId: c.id,
        rankingId: c.rankingId,
        challengerId: c.challengerId,
        challengedId: c.challengedId,
        reportedWinnerId: result?.winnerId ?? null,
        reportedSets: result?.sets ?? null,
        disputeNote: result?.disputeNote ?? null,
        disputedAt: c.disputedAt ?? c.createdAt,
      })
    }

    for (const f of friendliesService.listDisputed()) {
      const result = friendlyResultsService.findForFriendly(f.id)
      const participants = [f.initiatorId, ...f.invitees.map((i) => i.memberId)]
      items.push({
        kind: 'friendly',
        friendlyId: f.id,
        format: f.format,
        participants,
        reportedWinnerIds: result?.winnerMemberIds ?? [],
        reportedSets: result?.sets ?? [],
        disputeNote: result?.disputeNote ?? null,
        disputedAt: f.disputedAt ?? f.createdAt,
      })
    }

    items.sort((a, b) => b.disputedAt.getTime() - a.disputedAt.getTime())
    return items
  },

  /**
   * Trainer bestätigt ein gemeldetes Challenge-Ergebnis.
   * Setzt voraus, dass ein MatchResult existiert.
   */
  confirmChallenge(challengeId: ChallengeId, now: Date = new Date()): void {
    const result = resultsService.findForChallenge(challengeId)
    if (!result) throw new DisputeNotFoundError()
    resultsService.forceConfirm(result.id as MatchResultId, now)
  },

  /** Trainer bricht eine Challenge ab — Status CANCELLED, keine Rangliste-Wirkung. */
  cancelChallenge(challengeId: ChallengeId, now: Date = new Date()): void {
    challengesService.cancelByTrainer(challengeId, now)
  },

  confirmFriendly(friendlyId: FriendlyId, now: Date = new Date()): void {
    const result = friendlyResultsService.findForFriendly(friendlyId)
    if (!result) throw new DisputeNotFoundError()
    friendlyResultsService.forceConfirm(result.id as FriendlyResultId, now)
  },

  cancelFriendly(friendlyId: FriendlyId, now: Date = new Date()): void {
    friendliesService.cancelByTrainer(friendlyId, now)
  },
}
