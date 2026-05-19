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
  MemberDuplicateEmailError,
  MustKeepPlayerRoleError,
  memberAdminService,
} from './service/admin'
export {
  createMemberInput,
  setLkInput,
  setRolesInput,
  updateOwnProfileInput,
} from './types'
export type {
  CreateMemberInput,
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
