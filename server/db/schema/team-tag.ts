import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'
import { newPublicId } from '../../shared/public-id'

export type TeamTagId = Brand<string, 'TeamTagId'>

export const teamTag = sqliteTable(
  'team_tag',
  {
    id: text('id').primaryKey().$type<TeamTagId>().$defaultFn(() => newPublicId() as TeamTagId),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex('team_tag_name_lower_idx').on(sql`lower(${t.name})`)],
)

export type TeamTagRow = typeof teamTag.$inferSelect
export type TeamTagInsert = typeof teamTag.$inferInsert
