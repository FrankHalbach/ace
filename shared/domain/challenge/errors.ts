/**
 * Domain-Fehler für das Challenge-Aggregat. Werden in den State-Klassen
 * geworfen, in der Service-Schicht abgefangen und auf HTTP-Statuscodes
 * gemappt (siehe `server/api/challenges/...`).
 */

export class InvalidStateError extends Error {
  readonly code = 'challenge.invalid-state' as const
}

export class NotChallengedError extends Error {
  readonly code = 'challenge.not-participant' as const
  constructor() {
    super('only the challenged member may accept or decline')
  }
}

export class TrainerRequiredError extends Error {
  readonly code = 'challenge.trainer-required' as const
  constructor() {
    super('only trainers may do this action')
  }
}
