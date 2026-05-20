/**
 * Members-Modul Public API.
 *
 * Andere Module importieren ausschließlich aus dieser Datei
 * (siehe ADR-005 Modul-Schnitt). Direkter Zugriff auf
 * ./service/* oder ./repository/* von außen ist verboten.
 */
export { profileService, MemberNotFoundError } from './service/profile'
export { getMemberProfile } from './service/player-profile'
export {
  CannotRemoveLastAdminError,
  LkOutOfRangeError,
  MemberAlreadyDeactivatedError,
  MemberDeactivatedError,
  MemberDuplicateEmailError,
  MemberNotDeactivatedError,
  MustKeepPlayerRoleError,
  memberAdminService,
} from './service/admin'
export {
  CsvEncodingError,
  CsvParseError,
  importRowSchema,
  parseMembersCsv,
} from './service/csv-import'
export type {
  CsvImportError,
  CsvParseResult,
  ImportRow,
} from './service/csv-import'
export {
  createMemberInput,
  deactivateMemberInput,
  setLkInput,
  setRolesInput,
  updateOwnProfileInput,
} from './types'
export type {
  CreateMemberInput,
  DeactivateMemberInput,
  InviteResult,
  MatchPreferences,
  MemberAdminDto,
  MemberDto,
  MemberId,
  PlayerProfileDto,
  Role,
  SetLkInput,
  SetRolesInput,
  UpdateOwnProfileInput,
} from './types'
