import { auditRepo } from '../repository/audit-repo'
import type { AuditEntryDto, AuditLogInput } from '../types'
import type { AuditEntryRow } from '../../../db/schema/audit-entry'

function toDto(row: AuditEntryRow): AuditEntryDto {
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action,
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    before: row.before,
    after: row.after,
    note: row.note,
    createdAt: row.createdAt,
  }
}

export const auditService = {
  /**
   * Schreibt einen Audit-Eintrag. Wird von `admin`, `trainer`, später
   * `results` und `rankings` aufgerufen, sobald sie korrektur-artige
   * Aktionen ausführen.
   *
   * Bewusst synchron — die Schreib-Operation soll im selben
   * Transaction-Kontext der aufrufenden Mutation laufen.
   */
  log(input: AuditLogInput): AuditEntryDto {
    const row = auditRepo.insert({
      actorId: input.actorId,
      action: input.action,
      subjectKind: input.subjectKind ?? null,
      subjectId: input.subjectId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      note: input.note ?? null,
    })
    return toDto(row)
  },

  listRecent(limit?: number): AuditEntryDto[] {
    return auditRepo.listRecent(limit).map(toDto)
  },
}
