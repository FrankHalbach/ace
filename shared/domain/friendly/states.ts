/**
 * State-Klassen für das `Friendly`-Aggregat — eine pro Lifecycle-Phase.
 * Jede Klasse exponiert nur die Aktionen, die in diesem State gültig sind.
 *
 * Pattern: „Make illegal states unrepresentable". `reportedFriendly.cancel()`
 * kompiliert nicht, weil ReportedFriendly diese Methode gar nicht hat.
 * Dadurch werden Bug-Klassen wie #48 (Cancel nach Result) am Type-Level
 * verhindert statt durch Runtime-Guards in der Service-Schicht.
 */
import type {
  Actor,
  FriendlyId,
  FriendlyInviteeRow,
  FriendlyRow,
  FriendlyWithResultSnapshot,
  FriendlySnapshot,
  MemberId,
} from './types'
import type {
  AcceptInviteeMutation,
  CancelFriendlyMutation,
  ConfirmResultMutation,
  DeclineInviteeMutation,
  DisputeResultMutation,
  MarkPlayedMutation,
  ReportResultMutation,
  TrainerCancelMutation,
  TrainerForceConfirmMutation,
} from './mutations'
import {
  AlreadyRespondedError,
  BeforeScheduledError,
  NotInitiatorError,
  NotInviteeError,
  NotLoserError,
  NotParticipantError,
  NotWinnerError,
  TrainerRequiredError,
} from './errors'
import type { MatchOutcome, SetScore } from '../../match-scoring'
import { validateSetsForMode, verifyWinnerConsistency } from '../../match-scoring'

// ─── Hilfen, die auf allen State-Klassen gleich aussehen ─────────────────────

function findInvitee(invitees: ReadonlyArray<FriendlyInviteeRow>, memberId: MemberId): FriendlyInviteeRow | undefined {
  return invitees.find((i) => i.memberId === memberId)
}

function isInitiator(row: FriendlyRow, actor: Actor): boolean {
  return row.initiatorId === actor.memberId
}

function isParticipant(row: FriendlyRow, invitees: ReadonlyArray<FriendlyInviteeRow>, actor: Actor): boolean {
  if (isInitiator(row, actor)) return true
  return invitees.some((i) => i.memberId === actor.memberId)
}

function allParticipantIds(row: FriendlyRow, invitees: ReadonlyArray<FriendlyInviteeRow>): MemberId[] {
  return [row.initiatorId, ...invitees.map((i) => i.memberId)]
}

function teams(row: FriendlyRow, invitees: ReadonlyArray<FriendlyInviteeRow>): {
  initiatorTeam: MemberId[]
  opponentTeam: MemberId[]
} {
  const initiatorTeam: MemberId[] = [row.initiatorId]
  const opponentTeam: MemberId[] = []
  for (const i of invitees) {
    if (i.team === 'initiator') initiatorTeam.push(i.memberId)
    else opponentTeam.push(i.memberId)
  }
  return { initiatorTeam, opponentTeam }
}

function arraysSame(a: ReadonlyArray<MemberId>, b: ReadonlyArray<MemberId>): boolean {
  if (a.length !== b.length) return false
  const sa = new Set(a)
  return b.every((x) => sa.has(x))
}

// ─── ProposedFriendly: angelegt, mindestens ein Eingeladener pending ─────────

export class ProposedFriendly {
  readonly _state = 'PROPOSED' as const
  constructor(readonly snap: FriendlySnapshot) {}

  get id(): FriendlyId { return this.snap.row.id }
  get scheduledAt(): Date { return this.snap.row.scheduledAt }

  /** Akzeptiert ein Invitee. Wenn alle akzeptiert haben → `alsoConfirmFriendly`. */
  accept(actor: Actor, now: Date): AcceptInviteeMutation {
    const invitee = findInvitee(this.snap.invitees, actor.memberId)
    if (!invitee) throw new NotInviteeError()
    if (invitee.status !== 'pending') throw new AlreadyRespondedError()
    const stillPending = this.snap.invitees.some(
      (i) => i.memberId !== actor.memberId && i.status === 'pending',
    )
    return {
      kind: 'accept-invitee',
      friendlyId: this.snap.row.id,
      inviteeId: invitee.id,
      at: now,
      alsoConfirmFriendly: !stillPending,
    }
  }

  decline(actor: Actor, now: Date): DeclineInviteeMutation {
    const invitee = findInvitee(this.snap.invitees, actor.memberId)
    if (!invitee) throw new NotInviteeError()
    if (invitee.status !== 'pending') throw new AlreadyRespondedError()
    return {
      kind: 'decline-invitee',
      friendlyId: this.snap.row.id,
      inviteeId: invitee.id,
      at: now,
      alsoDeclineFriendly: true,
    }
  }

  cancel(actor: Actor, now: Date): CancelFriendlyMutation {
    if (!isInitiator(this.snap.row, actor) && !actor.isTrainer) throw new NotInitiatorError()
    return { kind: 'cancel-friendly', friendlyId: this.snap.row.id, at: now }
  }

  canAccept(actor: Actor): boolean { return safe(() => this.accept(actor, new Date())) }
  canDecline(actor: Actor): boolean { return safe(() => this.decline(actor, new Date())) }
  canCancel(actor: Actor): boolean { return safe(() => this.cancel(actor, new Date())) }
}

// ─── AcceptedFriendly: alle akzeptiert, kein Result gemeldet (= CONFIRMED) ───

export class AcceptedFriendly {
  readonly _state = 'CONFIRMED' as const
  constructor(readonly snap: FriendlySnapshot) {}

  get id(): FriendlyId { return this.snap.row.id }
  get scheduledAt(): Date { return this.snap.row.scheduledAt }

  cancel(actor: Actor, now: Date): CancelFriendlyMutation {
    if (!isInitiator(this.snap.row, actor) && !actor.isTrainer) throw new NotInitiatorError()
    return { kind: 'cancel-friendly', friendlyId: this.snap.row.id, at: now }
  }

  /** „Gespielt, kein Ergebnis" — Teilnehmer markiert. Setzt last_friendly_at. */
  markPlayed(actor: Actor, now: Date): MarkPlayedMutation {
    if (!isParticipant(this.snap.row, this.snap.invitees, actor)) throw new NotParticipantError()
    return {
      kind: 'mark-played',
      friendlyId: this.snap.row.id,
      at: now,
      participantIds: allParticipantIds(this.snap.row, this.snap.invitees),
    }
  }

  /**
   * Result-Report — `#47`-Fix: nur ab `scheduledAt`.
   * Reporter muss zum Sieger-Team gehören.
   */
  reportResult(actor: Actor, input: ReportInput, now: Date): ReportResultMutation {
    return buildReportMutation(this.snap.row, this.snap.invitees, actor, input, now)
  }

  canCancel(actor: Actor): boolean { return safe(() => this.cancel(actor, new Date())) }
  canMarkPlayed(actor: Actor): boolean { return safe(() => this.markPlayed(actor, new Date())) }
  canReportResult(_actor: Actor, now: Date = new Date()): boolean {
    return now.getTime() >= this.snap.row.scheduledAt.getTime()
  }
}

// ─── PlayedFriendly: als gespielt markiert, kein Result gemeldet ─────────────

export class PlayedFriendly {
  readonly _state = 'PLAYED' as const
  constructor(readonly snap: FriendlySnapshot) {}

  get id(): FriendlyId { return this.snap.row.id }
  get scheduledAt(): Date { return this.snap.row.scheduledAt }

  /**
   * Cancel ist weiterhin erlaubt, solange kein Result gemeldet wurde.
   * Sobald ein Result vorliegt, ist das Aggregat semantisch `ReportedFriendly`
   * (siehe Factory) — und ReportedFriendly hat KEIN cancel(). Das fixt #48
   * am Type-Level.
   */
  cancel(actor: Actor, now: Date): CancelFriendlyMutation {
    if (!isInitiator(this.snap.row, actor) && !actor.isTrainer) throw new NotInitiatorError()
    return { kind: 'cancel-friendly', friendlyId: this.snap.row.id, at: now }
  }

  reportResult(actor: Actor, input: ReportInput, now: Date): ReportResultMutation {
    return buildReportMutation(this.snap.row, this.snap.invitees, actor, input, now)
  }

  canCancel(actor: Actor): boolean { return safe(() => this.cancel(actor, new Date())) }
}

// ─── ReportedFriendly: Result existiert, wartet auf Confirm ──────────────────
// ☝ Bewusst KEIN cancel() → #48 ist am Type-Level gefixt.

export class ReportedFriendly {
  readonly _state = 'REPORTED' as const
  constructor(readonly snap: FriendlyWithResultSnapshot) {}

  get id(): FriendlyId { return this.snap.row.id }
  get scheduledAt(): Date { return this.snap.row.scheduledAt }
  get result(): FriendlyWithResultSnapshot['result'] { return this.snap.result }

  /** Verlierer-Team bestätigt. Triggert Friendly → COMPLETED. Trainer übergeht den Loser-Check. */
  confirmResult(actor: Actor, now: Date): ConfirmResultMutation {
    if (!actor.isTrainer) {
      const { initiatorTeam, opponentTeam } = teams(this.snap.row, this.snap.invitees)
      const winnerIsInitiator = arraysSame(this.snap.result.winnerMemberIds, initiatorTeam)
      const loserTeam = winnerIsInitiator ? opponentTeam : initiatorTeam
      if (!loserTeam.includes(actor.memberId)) throw new NotLoserError()
    }
    return {
      kind: 'confirm-result',
      friendlyId: this.snap.row.id,
      resultId: this.snap.result.id,
      confirmedBy: actor.memberId,
      at: now,
      participantIds: allParticipantIds(this.snap.row, this.snap.invitees),
    }
  }

  /** Verlierer-Team widerspricht. Triggert Friendly → DISPUTED. Trainer/Cron übergeht Loser-Check. */
  disputeResult(actor: Actor, note: string, now: Date): DisputeResultMutation {
    if (!actor.isTrainer) {
      const { initiatorTeam, opponentTeam } = teams(this.snap.row, this.snap.invitees)
      const winnerIsInitiator = arraysSame(this.snap.result.winnerMemberIds, initiatorTeam)
      const loserTeam = winnerIsInitiator ? opponentTeam : initiatorTeam
      if (!loserTeam.includes(actor.memberId)) throw new NotLoserError()
    }
    return {
      kind: 'dispute-result',
      friendlyId: this.snap.row.id,
      resultId: this.snap.result.id,
      at: now,
      note,
    }
  }

  canConfirm(actor: Actor): boolean { return safe(() => this.confirmResult(actor, new Date())) }
  canDispute(actor: Actor): boolean { return safe(() => this.disputeResult(actor, 'placeholder', new Date())) }
}

// ─── DisputedFriendly: Trainer entscheidet ───────────────────────────────────

export class DisputedFriendly {
  readonly _state = 'DISPUTED' as const
  constructor(readonly snap: FriendlyWithResultSnapshot) {}

  get id(): FriendlyId { return this.snap.row.id }

  /** Trainer bestätigt das gemeldete Result trotz Widerspruch. */
  trainerForceConfirm(actor: Actor, now: Date): TrainerForceConfirmMutation {
    if (!actor.isTrainer) throw new TrainerRequiredError()
    return {
      kind: 'trainer-force-confirm',
      friendlyId: this.snap.row.id,
      resultId: this.snap.result.id,
      at: now,
      participantIds: allParticipantIds(this.snap.row, this.snap.invitees),
    }
  }

  /** Trainer bricht den Streitfall ab — Friendly → CANCELLED. */
  trainerCancel(actor: Actor, now: Date): TrainerCancelMutation {
    if (!actor.isTrainer) throw new TrainerRequiredError()
    return { kind: 'trainer-cancel', friendlyId: this.snap.row.id, at: now, fromStatus: 'DISPUTED' }
  }
}

// ─── Terminal States: keine Aktionen ─────────────────────────────────────────

export class CompletedFriendly {
  readonly _state = 'COMPLETED' as const
  constructor(readonly snap: FriendlyWithResultSnapshot) {}
  get id(): FriendlyId { return this.snap.row.id }
}

export class CancelledFriendly {
  readonly _state = 'CANCELLED' as const
  constructor(readonly snap: FriendlySnapshot) {}
  get id(): FriendlyId { return this.snap.row.id }
}

export class DeclinedFriendly {
  readonly _state = 'DECLINED' as const
  constructor(readonly snap: FriendlySnapshot) {}
  get id(): FriendlyId { return this.snap.row.id }
}

// ─── Union ───────────────────────────────────────────────────────────────────

export type FriendlyMatch =
  | ProposedFriendly
  | AcceptedFriendly
  | PlayedFriendly
  | ReportedFriendly
  | DisputedFriendly
  | CompletedFriendly
  | CancelledFriendly
  | DeclinedFriendly

// ─── Geteilte Helper ─────────────────────────────────────────────────────────

export type ReportInput = {
  winnerMemberIds: MemberId[]
  sets: SetScore[]
  outcome?: MatchOutcome
  outcomeNote?: string
}

function buildReportMutation(
  row: FriendlyRow,
  invitees: ReadonlyArray<FriendlyInviteeRow>,
  actor: Actor,
  input: ReportInput,
  now: Date,
): ReportResultMutation {
  // #47-Fix: niemand meldet vor dem geplanten Termin
  if (now.getTime() < row.scheduledAt.getTime()) throw new BeforeScheduledError(row.scheduledAt)

  if (!isParticipant(row, invitees, actor)) throw new NotParticipantError()

  // Reporter muss zum Sieger-Team gehören
  if (!input.winnerMemberIds.includes(actor.memberId)) throw new NotWinnerError()

  // Sieger-Team-Shape muss passen (entweder Initiator-Team ODER Opponent-Team)
  const { initiatorTeam, opponentTeam } = teams(row, invitees)
  const isInitiatorTeamWinner = arraysSame(input.winnerMemberIds, initiatorTeam)
  const isOpponentTeamWinner = arraysSame(input.winnerMemberIds, opponentTeam)
  if (!isInitiatorTeamWinner && !isOpponentTeamWinner) throw new NotWinnerError()

  // Score-Plausi + Konsistenz Sieger ↔ Satzgewinne (außer bei walkover/retirement)
  const outcome = input.outcome ?? 'regular'
  validateSetsForMode(row.matchMode, input.sets, { outcome })
  if (outcome === 'regular') {
    // Spielfeld-Seite A entspricht dem Initiator-Team — wenn Initiator-Team
    // Sieger ist, muss A die Sätze gewinnen.
    verifyWinnerConsistency(input.sets, isInitiatorTeamWinner, { winnerSubject: 'team' })
  }

  return {
    kind: 'report-result',
    friendlyId: row.id,
    insert: {
      friendlyId: row.id,
      winnerMemberIds: input.winnerMemberIds,
      sets: input.sets,
      matchMode: row.matchMode,
      reportedAt: now,
      reportedBy: actor.memberId,
      confirmationStatus: 'pending' as const,
      outcome,
      outcomeNote: input.outcomeNote ?? null,
    },
  }
}

function safe(fn: () => unknown): boolean {
  try { fn(); return true } catch { return false }
}
