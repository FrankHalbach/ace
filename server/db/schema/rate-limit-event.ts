import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Generischer Counter für Rate-Limits — initial für Magic-Link-Anfragen
 * (FR-114), später auch für Challenge- und Freundschaftsspiel-Limits
 * (FR-110, FR-113) wiederverwendbar.
 */
export const rateLimitEvent = sqliteTable(
  'rate_limit_event',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('rle_key_time_idx').on(t.key, t.occurredAt)],
)

export type RateLimitEventRow = typeof rateLimitEvent.$inferSelect
