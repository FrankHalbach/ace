import { z } from 'zod'
import type {
  FriendlyFormat,
  FriendlyId,
  FriendlyMatchMode,
  FriendlyStatus,
} from '../../db/schema/friendly'
import type {
  FriendlyInviteeId,
  FriendlyInviteeStatus,
  FriendlyInviteeTeam,
} from '../../db/schema/friendly-invitee'
import type {
  ConfirmationStatus,
  FriendlyResultId,
  MatchOutcome,
  SetScore,
} from '../../db/schema/friendly-result'
import type { MemberId } from '../members'

export type {
  ConfirmationStatus,
  FriendlyFormat,
  FriendlyId,
  FriendlyInviteeId,
  FriendlyInviteeStatus,
  FriendlyInviteeTeam,
  FriendlyMatchMode,
  FriendlyResultId,
  FriendlyStatus,
  MatchOutcome,
  SetScore,
}

const matchModeEnum = z.enum(['two-sets-match-tiebreak'])

export const createFriendlyInput = z
  .object({
    format: z.enum(['singles', 'doubles']),
    scheduledAt: z.coerce.date(),
    courtInfo: z.string().max(120).optional(),
    note: z.string().max(500).optional(),
    matchMode: matchModeEnum,
    partnerId: z.string().min(16).max(32).optional(),
    opponentIds: z.array(z.string().min(16).max(32)).min(1).max(2),
  })
  .refine(
    (v) => {
      if (v.format === 'singles') {
        return v.partnerId === undefined && v.opponentIds.length === 1
      }
      return v.partnerId !== undefined && v.opponentIds.length === 2
    },
    { message: 'friendly.invalid-team-shape' },
  )
export type CreateFriendlyInput = z.infer<typeof createFriendlyInput>

// Lockere Plausi — die strikte Modus-Validation passiert in
// `validateSetsForMode`. Match-TB-Werte können > 20 sein.
const setScoreSchema = z.object({
  a: z.number().int().min(0).max(30),
  b: z.number().int().min(0).max(30),
})

export const reportFriendlyResultInput = z.object({
  winnerMemberIds: z.array(z.string().min(16).max(32)).min(1).max(2),
  sets: z.array(setScoreSchema).max(5),
  outcome: z.enum(['regular', 'walkover', 'retirement']).optional(),
  outcomeNote: z.string().max(500).optional(),
})
export type ReportFriendlyResultInput = z.infer<typeof reportFriendlyResultInput>

export const disputeFriendlyResultInput = z.object({
  note: z.string().min(1).max(1000),
})
export type DisputeFriendlyResultInput = z.infer<typeof disputeFriendlyResultInput>

export type FriendlyDto = {
  id: FriendlyId
  initiatorId: MemberId
  format: FriendlyFormat
  scheduledAt: Date
  courtInfo: string | null
  note: string | null
  matchMode: FriendlyMatchMode
  status: FriendlyStatus
  createdAt: Date
  confirmedAt: Date | null
  declinedAt: Date | null
  cancelledAt: Date | null
  playedAt: Date | null
  completedAt: Date | null
  disputedAt: Date | null
  /**
   * Zeitpunkt, ab dem Decline/Cancel verboten ist (N-05) — `scheduledAt`
   * minus die in der aktiven Saison konfigurierte Late-Cancel-Spanne.
   * Frontend kann dagegen `Date.now()` vergleichen, um den Absagen-Button
   * zu disablen.
   */
  cancellationLockedAt: Date
}

export type FriendlyInviteeDto = {
  id: FriendlyInviteeId
  friendlyId: FriendlyId
  memberId: MemberId
  team: FriendlyInviteeTeam
  status: FriendlyInviteeStatus
  respondedAt: Date | null
}

export type FriendlyDetailDto = FriendlyDto & {
  invitees: FriendlyInviteeDto[]
}

export type FriendlyResultDto = {
  id: FriendlyResultId
  friendlyId: FriendlyId
  winnerMemberIds: MemberId[]
  sets: SetScore[]
  matchMode: FriendlyMatchMode
  reportedAt: Date
  reportedBy: MemberId
  confirmationStatus: ConfirmationStatus
  confirmedAt: Date | null
  confirmedBy: MemberId | null
  disputedAt: Date | null
  disputeNote: string | null
  outcome: MatchOutcome
  outcomeNote: string | null
}

// ─── Errors ───────────────────────────────────────────────────────────────

export class FriendlyNotFoundError extends Error {
  readonly code = 'friendly.not-found' as const
  constructor(public readonly id: FriendlyId) {
    super(`friendly ${id} not found`)
  }
}

export class FriendlyNotParticipantError extends Error {
  readonly code = 'friendly.not-participant' as const
  constructor() {
    super('not a participant of this friendly')
  }
}

export class FriendlyInvalidTransitionError extends Error {
  readonly code = 'friendly.invalid-transition' as const
  constructor(
    public readonly from: FriendlyStatus,
    public readonly to: FriendlyStatus,
  ) {
    super(`cannot transition friendly ${from} → ${to}`)
  }
}

export class FriendlyValidationError extends Error {
  readonly code: string
  constructor(code: string, msg: string) {
    super(msg)
    this.code = code
  }
}

export class FriendlyResultNotFoundError extends Error {
  readonly code = 'friendly-result.not-found' as const
  constructor(public readonly id: FriendlyResultId) {
    super(`friendly-result ${id} not found`)
  }
}

export class NotWinnerError extends Error {
  readonly code = 'friendly.not-winner' as const
  constructor() {
    super('only winner-team members may report')
  }
}

export class NotLoserError extends Error {
  readonly code = 'friendly.not-loser' as const
  constructor() {
    super('only loser-team members may confirm or dispute')
  }
}

export class AlreadyConfirmedError extends Error {
  readonly code = 'friendly-result.already-confirmed' as const
  constructor() {
    super('friendly result is already confirmed and immutable')
  }
}

export { InvalidSetsError } from '../../../shared/match-scoring'
