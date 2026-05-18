/**
 * Team-Tags-Modul Public API (ADR-005).
 *
 * Mannschafts-Tags sind laut FR-2g/h/i reine Anzeige-Information ohne
 * Spiel-Logik — Lese-Zugriff für Profil, Rangliste und Member-Card,
 * Schreib-Zugriff für Admin und Trainer.
 *
 * Skelett-PR: Repo + Service-Signaturen ohne Endpoints und ohne
 * Mutations-Implementation. Read-Pfad (listAll, listForMember) ist bereits
 * nutzbar, damit konsumierende Module ihre Anbindung vorbereiten können.
 */
export { TeamTagNotFoundError, teamTagsService } from './service/team-tags'
export type {
  AssignTagsInput,
  CreateTeamTagInput,
  TeamTagDto,
  TeamTagId,
  UpdateTeamTagInput,
} from './types'
