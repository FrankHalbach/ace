/**
 * Admin-Modul Public API (ADR-005).
 *
 * Stellt Audit-Logging als Cross-Modul-Service bereit. Konkrete
 * Admin-Endpoints (Mitgliederverwaltung, Rollen-Zuweisung, Korrekturen)
 * folgen in weiteren PRs — der Skelett-PR baut nur das Fundament.
 */
export { auditService } from './service/audit'
export type {
  AuditAction,
  AuditEntryDto,
  AuditEntryId,
  AuditLogInput,
  AuditSubjectKind,
} from './types'
