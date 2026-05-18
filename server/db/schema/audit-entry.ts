import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'
import { newPublicId } from '../../shared/public-id'
import { member, type MemberId } from './member'

export type AuditEntryId = Brand<string, 'AuditEntryId'>

export type AuditAction =
  | 'member.role-changed'
  | 'member.deactivated'
  | 'member.reactivated'
  | 'member.lk-corrected'
  | 'member.invited'
  | 'member.imported'
  | 'member.team-tags-changed'
  | 'team-tag.created'
  | 'team-tag.renamed'
  | 'team-tag.deleted'
  | 'result.corrected'
  | 'result.dispute-decided'
  | 'challenge.cancelled-by-trainer'
  | 'friendly.cancelled-by-trainer'

export type AuditSubjectKind = 'member' | 'challenge' | 'friendly' | 'result' | 'team-tag'

export const auditEntry = sqliteTable(
  'audit_entry',
  {
    id: text('id').primaryKey().$type<AuditEntryId>().$defaultFn(() => newPublicId() as AuditEntryId),
    actorId: text('actor_id').notNull().references(() => member.id).$type<MemberId>(),
    action: text('action').$type<AuditAction>().notNull(),
    subjectKind: text('subject_kind').$type<AuditSubjectKind>(),
    subjectId: text('subject_id'),
    before: text('before', { mode: 'json' }).$type<unknown>(),
    after: text('after', { mode: 'json' }).$type<unknown>(),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('audit_entry_subject_idx').on(t.subjectKind, t.subjectId),
    index('audit_entry_created_idx').on(t.createdAt),
    index('audit_entry_actor_idx').on(t.actorId),
  ],
)

export type AuditEntryRow = typeof auditEntry.$inferSelect
export type AuditEntryInsert = typeof auditEntry.$inferInsert
