import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'
import { season, type SeasonId } from './season'

export type AgeGroupId = Brand<number, 'AgeGroupId'>

/**
 * Geschlechtsregel je Altersgruppe (FR-2j, FR-10, FR-10b):
 *   - mixed:    nur Offene Rangliste — typischerweise Jugend
 *   - separate: nur Herren + Damen — selten, aber möglich
 *   - both:     Herren + Damen + Offen — Default für Erwachsene
 */
export type GenderRule = 'mixed' | 'separate' | 'both'

export const ageGroup = sqliteTable(
  'age_group',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).$type<AgeGroupId>(),
    seasonId: integer('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' })
      .$type<SeasonId>(),
    name: text('name').notNull(),
    minAge: integer('min_age'),
    maxAge: integer('max_age'),
    genderRule: text('gender_rule', { enum: ['mixed', 'separate', 'both'] }).notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [uniqueIndex('age_group_season_name_idx').on(t.seasonId, t.name)],
)

export type AgeGroupRow = typeof ageGroup.$inferSelect
export type AgeGroupInsert = typeof ageGroup.$inferInsert
