import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'
import { season, type SeasonId } from './season'

export type AgeGroupId = Brand<number, 'AgeGroupId'>

/**
 * Geschlecht der Konkurrenz (FR-2j, FR-10, FR-10b):
 *   - 'm':     nur Herren in dieser Konkurrenz
 *   - 'w':     nur Damen
 *   - 'mixed': geschlechtsoffen — typischerweise Jugend, oder eine
 *              vereinsinterne „Offen"-Konkurrenz
 *
 * Eine AgeGroup entspricht genau einer Rangliste, kein Cross-Product.
 */
export type AgeGroupGender = 'm' | 'w' | 'mixed'

export const ageGroup = sqliteTable(
  'age_group',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).$type<AgeGroupId>(),
    seasonId: text('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' })
      .$type<SeasonId>(),
    name: text('name').notNull(),
    minAge: integer('min_age'),
    maxAge: integer('max_age'),
    gender: text('gender', { enum: ['m', 'w', 'mixed'] }).notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [uniqueIndex('age_group_season_name_idx').on(t.seasonId, t.name)],
)

export type AgeGroupRow = typeof ageGroup.$inferSelect
export type AgeGroupInsert = typeof ageGroup.$inferInsert
