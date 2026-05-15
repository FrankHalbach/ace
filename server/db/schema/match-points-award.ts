import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { matchResult, type MatchResultId } from './match-result'
import { member, type MemberId } from './member'
import { rankingEntry, type RankingEntryId } from './ranking-entry'

export type PointsAwardReason = 'challenge-win' | 'challenge-loss' | 'walkover-win'

export const matchPointsAward = sqliteTable(
  'match_points_award',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    matchResultId: integer('match_result_id')
      .notNull()
      .references(() => matchResult.id, { onDelete: 'cascade' })
      .$type<MatchResultId>(),
    rankingEntryId: integer('ranking_entry_id')
      .notNull()
      .references(() => rankingEntry.id, { onDelete: 'cascade' })
      .$type<RankingEntryId>(),
    memberId: integer('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' })
      .$type<MemberId>(),
    points: integer('points').notNull(),
    reason: text('reason', {
      enum: ['challenge-win', 'challenge-loss', 'walkover-win'],
    }).notNull(),
    awardedAt: integer('awarded_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('mpa_member_idx').on(t.memberId)],
)

export type MatchPointsAwardRow = typeof matchPointsAward.$inferSelect
