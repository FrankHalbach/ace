import { desc } from 'drizzle-orm'
import { useDb } from '../../../db'
import {
  auditEntry,
  type AuditEntryInsert,
  type AuditEntryRow,
} from '../../../db/schema/audit-entry'

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
}
