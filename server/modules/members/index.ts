/**
 * Members-Modul Public API.
 *
 * Andere Module importieren ausschließlich aus dieser Datei
 * (siehe ADR-005 Modul-Schnitt). Direkter Zugriff auf
 * ./service/* oder ./repository/* von außen ist verboten.
 */
export { profileService, MemberNotFoundError } from './service/profile'
export { getMemberProfile } from './service/player-profile'
export { updateOwnProfileInput } from './types'
export type {
  MatchPreferences,
  MemberDto,
  MemberId,
  PlayerProfileDto,
  Role,
  UpdateOwnProfileInput,
} from './types'
