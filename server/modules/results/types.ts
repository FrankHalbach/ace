import { z } from 'zod'
import type { ChallengeId } from '../challenges'
import type { MemberId } from '../members'
import type {
  ConfirmationStatus,
  MatchMode,
  MatchOutcome,
  MatchResultId,
  SetScore,
} from '../../db/schema/match-result'

export { InvalidSetsError } from '../../shared/match-scoring'
export type { ChallengeId, ConfirmationStatus, MatchMode, MatchOutcome, MatchResultId, SetScore }

const setScoreSchema = z.object({
  a: z.number().int().min(0).max(20),
  b: z.number().int().min(0).max(20),
})

export const reportResultInput = z.object({
  winnerId: z.string().min(16).max(32),
  sets: z.array(setScoreSchema).max(5),
  matchMode: z
    .enum([
      'two-sets-match-tiebreak',
      'best-of-3-tiebreak',
      'best-of-3-full',
      'best-of-3-champions',
      'short-sets-tiebreak',
      'pro-set',
    ])
    .optional(),
  outcome: z.enum(['regular', 'walkover', 'retirement']).optional(),
  outcomeNote: z.string().max(500).optional(),
})
export type ReportResultInput = z.infer<typeof reportResultInput>

export const disputeResultInput = z.object({
  note: z.string().min(1).max(1000),
})
export type DisputeResultInput = z.infer<typeof disputeResultInput>

export type MatchResultDto = {
  id: MatchResultId
  challengeId: ChallengeId
  winnerId: MemberId
  sets: SetScore[]
  matchMode: MatchMode
  reportedAt: Date
  reportedBy: MemberId
  confirmationStatus: ConfirmationStatus
  confirmedAt: Date | null
  disputedAt: Date | null
  disputeNote: string | null
  outcome: MatchOutcome
  outcomeNote: string | null
  applied: boolean
  appliedAt: Date | null
}

export class MatchResultNotFoundError extends Error {
  readonly code = 'result.not-found' as const
  constructor(public readonly id: MatchResultId) {
    super(`match result ${id} not found`)
  }
}

export class NotWinnerOrLoserError extends Error {
  readonly code = 'result.not-winner-or-loser' as const
  constructor() {
    super('only winner or loser of the match may act here')
  }
}

export class NotLoserError extends Error {
  readonly code = 'result.not-loser' as const
  constructor() {
    super('only the loser may confirm or dispute')
  }
}

export class AlreadyConfirmedError extends Error {
  readonly code = 'result.already-confirmed' as const
  constructor() {
    super('result is already confirmed and immutable')
  }
}

export class ChallengeNotAcceptedError extends Error {
  readonly code = 'result.challenge-not-accepted' as const
  constructor() {
    super('result can only be reported for ACCEPTED challenges')
  }
}
