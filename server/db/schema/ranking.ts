import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'
import { newPublicId } from '../../shared/public-id'
import { ageGroup, type AgeGroupId } from './age-group'
import { season, type SeasonId } from './season'

export type RankingId = Brand<string, 'RankingId'>

export type RankingMode = 'pyramid' | 'elo' | 'hybrid' | 'points-table'

/**
 * Modus-spezifische Konfiguration. Welche Felder belegt sind, hängt vom
 * gewählten Modus ab. Validiert pro Modus durch das jeweilige Strategy-
 * Zod-Schema.
 */
export type RankingConfig = {
  maxJumpUp?: number
  kFactor?: number
  pointValues?: {
    challengeWin: number
    challengeLoss: number
    friendlyWin: number
    friendlyLoss: number
    friendlyNoResult: number
    walkoverWin: number
    diversityBonus: number
  }
}

export const ranking = sqliteTable(
  'ranking',
  {
    id: text('id').primaryKey().$type<RankingId>().$defaultFn(() => newPublicId() as RankingId),
    seasonId: integer('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' })
      .$type<SeasonId>(),
    ageGroupId: integer('age_group_id')
      .notNull()
      .references(() => ageGroup.id, { onDelete: 'cascade' })
      .$type<AgeGroupId>(),
    mode: text('mode', { enum: ['pyramid', 'elo', 'hybrid', 'points-table'] }).notNull(),
    config: text('config', { mode: 'json' }).$type<RankingConfig>().notNull().default({}),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex('ranking_unique_idx').on(t.seasonId, t.ageGroupId)],
)

export type RankingRow = typeof ranking.$inferSelect
export type RankingInsert = typeof ranking.$inferInsert
