import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { member, type MemberId } from './member'

export const magicLinkToken = sqliteTable(
  'magic_link_token',
  {
    token: text('token').primaryKey(),
    memberId: integer('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' })
      .$type<MemberId>(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    consumedAt: integer('consumed_at', { mode: 'timestamp' }),
  },
  (t) => [index('mlt_member_created_idx').on(t.memberId, t.createdAt)],
)

export type MagicLinkTokenRow = typeof magicLinkToken.$inferSelect
export type MagicLinkTokenInsert = typeof magicLinkToken.$inferInsert
