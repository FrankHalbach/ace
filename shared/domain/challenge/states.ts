/**
 * State-Klassen für das `Challenge`-Aggregat — eine pro Lifecycle-Phase.
 * Jede Klasse exponiert nur die Aktionen, die in diesem State gültig sind.
 *
 * Pattern: „Make illegal states unrepresentable". `completedChallenge.accept()`
 * kompiliert nicht, weil CompletedChallenge diese Methode gar nicht hat.
 *
 * Anders als Friendly hat Challenge keinen `scheduledAt`-Termin und kein
 * eigenes Result — Results leben im `match-result`-Modul. Daher modelliert
 * Challenge nur die Status-Übergänge ihres eigenen Lifecycles; markCompleted
 * und markDisputed werden vom Results-Modul aufgerufen.
 */
import type {
  Actor,
  ChallengeId,
  ChallengeRow,
  ChallengeSnapshot,
  DeclineInput,
} from './types'
import type {
  AcceptChallengeMutation,
  DeclineChallengeMutation,
  ExpireChallengeMutation,
  MarkChallengeCompletedMutation,
  MarkChallengeDisputedMutation,
  TrainerCancelChallengeMutation,
} from './mutations'
import { NotChallengedError, TrainerRequiredError } from './errors'

function isChallenged(row: ChallengeRow, actor: Actor): boolean {
  return row.challengedId === actor.memberId
}

// ─── ProposedChallenge: angelegt, wartet auf Accept/Decline ─────────────────

export class ProposedChallenge {
  readonly _state = 'PROPOSED' as const
  constructor(readonly snap: ChallengeSnapshot) {}

  get id(): ChallengeId {
    return this.snap.row.id
  }

  accept(actor: Actor, now: Date): AcceptChallengeMutation {
    if (!isChallenged(this.snap.row, actor)) throw new NotChallengedError()
    return { kind: 'accept-challenge', challengeId: this.snap.row.id, at: now }
  }

  decline(actor: Actor, input: DeclineInput, now: Date): DeclineChallengeMutation {
    if (!isChallenged(this.snap.row, actor)) throw new NotChallengedError()
    return {
      kind: 'decline-challenge',
      challengeId: this.snap.row.id,
      at: now,
      reason: input.reason,
      note: input.note,
    }
  }

  /** Cron-Pfad: PROPOSED ohne Accept nach 7 Tagen → EXPIRED. */
  expire(now: Date): ExpireChallengeMutation {
    return { kind: 'expire-challenge', challengeId: this.snap.row.id, at: now }
  }

  canAccept(actor: Actor): boolean {
    return safe(() => this.accept(actor, new Date()))
  }
  canDecline(actor: Actor): boolean {
    return safe(() => this.decline(actor, { reason: 'other', note: null }, new Date()))
  }
}

// ─── AcceptedChallenge: Match darf gespielt + gemeldet werden ───────────────

export class AcceptedChallenge {
  readonly _state = 'ACCEPTED' as const
  constructor(readonly snap: ChallengeSnapshot) {}

  get id(): ChallengeId {
    return this.snap.row.id
  }

  /** Vom Results-Modul gerufen, wenn der Verlierer das Result bestätigt. */
  markCompleted(now: Date): MarkChallengeCompletedMutation {
    return { kind: 'mark-completed', challengeId: this.snap.row.id, at: now }
  }

  /** Vom Results-Modul gerufen, wenn der Verlierer das Result anficht. */
  markDisputed(now: Date): MarkChallengeDisputedMutation {
    return { kind: 'mark-disputed', challengeId: this.snap.row.id, at: now }
  }

  /** Cron-Pfad: ACCEPTED ohne Result nach 21 Tagen → DISPUTED. */
  markStaleDisputed(now: Date): MarkChallengeDisputedMutation {
    return { kind: 'mark-disputed', challengeId: this.snap.row.id, at: now }
  }
}

// ─── DisputedChallenge: Trainer entscheidet ─────────────────────────────────

export class DisputedChallenge {
  readonly _state = 'DISPUTED' as const
  constructor(readonly snap: ChallengeSnapshot) {}

  get id(): ChallengeId {
    return this.snap.row.id
  }

  /** Trainer-Force-Confirm: Result wird bestätigt → Challenge → COMPLETED. */
  markCompleted(actor: Actor, now: Date): MarkChallengeCompletedMutation {
    if (!actor.isTrainer) throw new TrainerRequiredError()
    return { kind: 'mark-completed', challengeId: this.snap.row.id, at: now }
  }

  /** Trainer bricht den Streitfall ab — Challenge → CANCELLED, keine Rangliste-Wirkung. */
  trainerCancel(actor: Actor, now: Date): TrainerCancelChallengeMutation {
    if (!actor.isTrainer) throw new TrainerRequiredError()
    return { kind: 'trainer-cancel', challengeId: this.snap.row.id, at: now }
  }
}

// ─── Terminal States: keine Aktionen ────────────────────────────────────────

export class CompletedChallenge {
  readonly _state = 'COMPLETED' as const
  constructor(readonly snap: ChallengeSnapshot) {}
  get id(): ChallengeId {
    return this.snap.row.id
  }
}

export class CancelledChallenge {
  readonly _state = 'CANCELLED' as const
  constructor(readonly snap: ChallengeSnapshot) {}
  get id(): ChallengeId {
    return this.snap.row.id
  }
}

export class DeclinedChallenge {
  readonly _state = 'DECLINED' as const
  constructor(readonly snap: ChallengeSnapshot) {}
  get id(): ChallengeId {
    return this.snap.row.id
  }
}

export class ExpiredChallenge {
  readonly _state = 'EXPIRED' as const
  constructor(readonly snap: ChallengeSnapshot) {}
  get id(): ChallengeId {
    return this.snap.row.id
  }
}

// ─── Union ──────────────────────────────────────────────────────────────────

export type ChallengeMatch =
  | ProposedChallenge
  | AcceptedChallenge
  | DisputedChallenge
  | CompletedChallenge
  | CancelledChallenge
  | DeclinedChallenge
  | ExpiredChallenge

// ─── Hilfen ─────────────────────────────────────────────────────────────────

function safe(fn: () => unknown): boolean {
  try {
    fn()
    return true
  } catch {
    return false
  }
}
