/**
 * Friendlies-Modul Public API (ADR-005).
 */
export { friendliesService } from './service/friendlies'
export { friendlyResultsService } from './service/friendly-results'
export {
  AlreadyConfirmedError,
  createFriendlyInput,
  disputeFriendlyResultInput,
  FriendlyInvalidTransitionError,
  FriendlyNotFoundError,
  FriendlyNotParticipantError,
  FriendlyResultNotFoundError,
  FriendlyValidationError,
  InvalidSetsError,
  NotLoserError,
  NotWinnerError,
  reportFriendlyResultInput,
} from './types'
export type {
  ConfirmationStatus,
  CreateFriendlyInput,
  DisputeFriendlyResultInput,
  FriendlyDetailDto,
  FriendlyDto,
  FriendlyFormat,
  FriendlyId,
  FriendlyInviteeDto,
  FriendlyInviteeId,
  FriendlyInviteeStatus,
  FriendlyInviteeTeam,
  FriendlyMatchMode,
  FriendlyResultDto,
  FriendlyResultId,
  FriendlyStatus,
  ReportFriendlyResultInput,
  SetScore,
} from './types'
