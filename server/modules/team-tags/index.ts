/**
 * Team-Tags-Modul Public API (ADR-005).
 *
 * Mannschafts-Tags sind laut FR-2g/h/i reine Anzeige-Information ohne
 * Spiel-Logik — Lese-Zugriff für Profil, Rangliste und Member-Card,
 * Schreib-Zugriff für Admin und Trainer.
 */
export {
  TeamTagDuplicateNameError,
  TeamTagInactiveError,
  TeamTagNotFoundError,
  teamTagsService,
} from './service/team-tags'
export {
  createTeamTagInput,
  setMemberTeamTagsInput,
  updateTeamTagInput,
} from './types'
export type {
  AssignTagsInput,
  CreateTeamTagInput,
  SetMemberTeamTagsInput,
  TeamMemberDto,
  TeamTagDto,
  TeamTagId,
  UpdateTeamTagInput,
} from './types'
