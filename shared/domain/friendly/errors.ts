/**
 * Domain-Fehler für das Friendly-Aggregat. Werden in den State-Klassen
 * geworfen, in der Service-Schicht abgefangen und auf HTTP-Statuscodes
 * gemappt (siehe `server/api/friendlies/...`).
 */

export class InvalidStateError extends Error {
  readonly code = 'friendly.invalid-state' as const
  constructor(message: string) {
    super(message)
  }
}

export class NotInitiatorError extends Error {
  readonly code = 'friendly.not-initiator' as const
  constructor() {
    super('only the initiator may do this')
  }
}

export class NotParticipantError extends Error {
  readonly code = 'friendly.not-participant' as const
  constructor() {
    super('not a participant of this friendly')
  }
}

export class NotInviteeError extends Error {
  readonly code = 'friendly.not-invitee' as const
  constructor() {
    super('only an invitee may accept/decline')
  }
}

export class AlreadyRespondedError extends Error {
  readonly code = 'friendly.already-responded' as const
  constructor() {
    super('invitee has already responded')
  }
}

/** Result wurde vor dem geplanten Termin gemeldet — fix für #47. */
export class BeforeScheduledError extends Error {
  readonly code = 'friendly.before-scheduled' as const
  constructor(public readonly scheduledAt: Date) {
    super(`match is scheduled for ${scheduledAt.toISOString()}, cannot report result before that`)
  }
}

export class NotWinnerError extends Error {
  readonly code = 'friendly.not-winner' as const
  constructor() {
    super('only members of the winning team may report')
  }
}

export class NotLoserError extends Error {
  readonly code = 'friendly.not-loser' as const
  constructor() {
    super('only members of the losing team may confirm/dispute')
  }
}

export class TrainerRequiredError extends Error {
  readonly code = 'friendly.trainer-required' as const
  constructor() {
    super('only trainers may do this action')
  }
}
