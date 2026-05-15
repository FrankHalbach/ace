import type { ChallengeId } from '../challenges'
import type { FriendlyFormat, FriendlyId, SetScore } from '../friendlies'
import type { MemberId } from '../members'
import type { RankingId } from '../rankings'

export type DisputeListItem =
  | {
      kind: 'challenge'
      challengeId: ChallengeId
      rankingId: RankingId
      challengerId: MemberId
      challengedId: MemberId
      reportedWinnerId: MemberId | null
      reportedSets: SetScore[] | null
      disputeNote: string | null
      disputedAt: Date
    }
  | {
      kind: 'friendly'
      friendlyId: FriendlyId
      format: FriendlyFormat
      participants: MemberId[]
      reportedWinnerIds: MemberId[]
      reportedSets: SetScore[]
      disputeNote: string | null
      disputedAt: Date
    }

export type ActivityOverviewRow = {
  memberId: MemberId
  firstName: string
  lastName: string
  status: 'aktiv' | 'pausiert'
  lastMatchAt: Date | null
  matchesLast4Weeks: number
}

export class DisputeNotFoundError extends Error {
  readonly code = 'dispute.not-found' as const
  constructor() {
    super('dispute not found')
  }
}
