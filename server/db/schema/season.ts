import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'

export type SeasonId = Brand<number, 'SeasonId'>

export type SeasonStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED'

/**
 * Saison-spezifische Konfiguration als JSON-Container.
 * Wird in diesem Feature leer initialisiert; das `challenges`-Feature
 * füllt konkrete Felder (Annahmefrist, Cooldown, etc.).
 */
export type SeasonConfig = Record<string, unknown>

export const season = sqliteTable(
  'season',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).$type<SeasonId>(),
    name: text('name').notNull(),
    status: text('status', {
      enum: ['PLANNED', 'ACTIVE', 'CLOSED', 'ARCHIVED'],
    })
      .notNull()
      .default('PLANNED'),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    closedAt: integer('closed_at', { mode: 'timestamp' }),
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    config: text('config', { mode: 'json' }).$type<SeasonConfig>().notNull().default({}),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex('season_name_idx').on(t.name)],
)

export type SeasonRow = typeof season.$inferSelect
export type SeasonInsert = typeof season.$inferInsert
