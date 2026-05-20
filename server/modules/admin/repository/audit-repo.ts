import { and, desc, eq, gte, lt, lte, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { useDb } from '../../../db'
import {
  auditEntry,
  type AuditAction,
  type AuditEntryInsert,
  type AuditEntryRow,
  type AuditSubjectKind,
} from '../../../db/schema/audit-entry'
import type { MemberId } from '../../members'

export type AuditFilter = {
  action?: AuditAction
  actorId?: MemberId
  subjectKind?: AuditSubjectKind
  subjectId?: string
  from?: Date
  to?: Date
}

/**
 * Stabiler Cursor: jüngste zuerst, bei Gleichstand auf createdAt nach id
 * lexikographisch absteigend. id ist ein nanoid und sortiert deterministisch.
 */
export type AuditCursor = {
  createdAt: Date
  id: string
}

export const auditRepo = {
  insert(values: AuditEntryInsert): AuditEntryRow {
    const rows = useDb().insert(auditEntry).values(values).returning().all()
    return rows[0]!
  },

  listRecent(limit = 100): AuditEntryRow[] {
    return useDb()
      .select()
      .from(auditEntry)
      .orderBy(desc(auditEntry.createdAt))
      .limit(limit)
      .all()
  },

  /**
   * Filterbare Liste mit Cursor-Pagination. Liest `limit + 1` Zeilen, damit
   * der Aufrufer weiß, ob es noch mehr Seiten gibt, ohne zweite Query.
   */
  listFiltered(
    filter: AuditFilter,
    cursor: AuditCursor | undefined,
    limit: number,
  ): AuditEntryRow[] {
    const conditions: SQL[] = []
    if (filter.action) conditions.push(eq(auditEntry.action, filter.action))
    if (filter.actorId) conditions.push(eq(auditEntry.actorId, filter.actorId))
    if (filter.subjectKind) conditions.push(eq(auditEntry.subjectKind, filter.subjectKind))
    if (filter.subjectId) conditions.push(eq(auditEntry.subjectId, filter.subjectId))
    if (filter.from) conditions.push(gte(auditEntry.createdAt, filter.from))
    if (filter.to) conditions.push(lte(auditEntry.createdAt, filter.to))

    if (cursor) {
      // (createdAt, id) < (cursor.createdAt, cursor.id) in DESC order:
      //   createdAt < cursor.createdAt
      //   OR (createdAt == cursor.createdAt AND id < cursor.id)
      const cursorCond = or(
        lt(auditEntry.createdAt, cursor.createdAt),
        and(eq(auditEntry.createdAt, cursor.createdAt), lt(auditEntry.id, cursor.id)),
      )
      if (cursorCond) conditions.push(cursorCond)
    }

    return useDb()
      .select()
      .from(auditEntry)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditEntry.createdAt), desc(auditEntry.id))
      .limit(limit + 1)
      .all()
  },

  /**
   * Distinkte Akteure für die Filter-Dropdown-Liste. Begrenzt — bei sehr
   * vielen Aktionen reicht's, die häufigsten zu zeigen; die UI kann das
   * Limit erhöhen, wenn nötig.
   */
  distinctActorIds(limit = 50): MemberId[] {
    const rows = useDb()
      .selectDistinct({ actorId: auditEntry.actorId })
      .from(auditEntry)
      .orderBy(sql`${auditEntry.actorId}`)
      .limit(limit)
      .all()
    return rows.map((r) => r.actorId)
  },
}
