/**
 * Results-Modul Public API (ADR-005).
 */
export { resultsService } from './service/results'
export {
  AlreadyConfirmedError,
  ChallengeNotAcceptedError,
  disputeResultInput,
  InvalidSetsError,
  MatchResultNotFoundError,
  NotLoserError,
  NotWinnerOrLoserError,
  reportResultInput,
} from './types'
export type {
  DisputeResultInput,
  MatchMode,
  MatchResultDto,
  MatchResultId,
  ReportResultInput,
  SetScore,
} from './types'
