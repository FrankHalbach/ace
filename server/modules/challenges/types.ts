import { z } from 'zod'
import type {
  ChallengeId,
  ChallengeStatus,
  DeclineReason,
} from '../../db/schema/challenge'
import type { MemberId } from '../members'
import type { RankingId, RankingVariant } from '../rankings'

export type { ChallengeId, ChallengeStatus, DeclineReason }

export const createChallengeInput = z.object({
  challengedId: z.number().int().positive(),
  rankingId: z.number().int().positive(),
})
export type CreateChallengeInput = z.infer<typeof createChallengeInput>

export const declineChallengeInput = z.object({
  reason: z.enum(['injury', 'vacation', 'work', 'other']),
  note: z.string().max(500).optional(),
})
export type DeclineChallengeInput = z.infer<typeof declineChallengeInput>

export type ChallengeDto = {
  id: ChallengeId
  challengerId: MemberId
  challengedId: MemberId
  rankingId: RankingId
  status: ChallengeStatus
  createdAt: Date
  acceptedAt: Date | null
  declinedAt: Date | null
  expiredAt: Date | null
  completedAt: Date | null
  disputedAt: Date | null
  declineReason: DeclineReason | null
  declineNote: string | null
}

export type ChallengeListItemDto = ChallengeDto & {
  challengerName: string
  challengedName: string
  rankingName: string // z. B. "Aktive · Herren"
  rankingVariant: RankingVariant
}

export class ChallengeNotFoundError extends Error {
  readonly code = 'challenge.not-found' as const
  constructor(public readonly id: ChallengeId) {
    super(`challenge ${id} not found`)
  }
}

export class ChallengeNotParticipantError extends Error {
  readonly code = 'challenge.not-participant' as const
  constructor() {
    super('not a participant of this challenge')
  }
}

export class ChallengeInvalidTransitionError extends Error {
  readonly code = 'challenge.invalid-transition' as const
  constructor(public readonly from: ChallengeStatus, public readonly to: ChallengeStatus) {
    super(`cannot transition ${from} → ${to}`)
  }
}

export class ChallengeValidationError extends Error {
  readonly code: string
  constructor(code: string, msg: string) {
    super(msg)
    this.code = code
  }
}
