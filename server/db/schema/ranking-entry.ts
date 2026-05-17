import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'
import { member, type MemberId } from './member'
import { ranking, type RankingId } from './ranking'

export type RankingEntryId = Brand<number, 'RankingEntryId'>

export const rankingEntry = sqliteTable(
  'ranking_entry',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).$type<RankingEntryId>(),
    rankingId: integer('ranking_id')
      .notNull()
      .references(() => ranking.id, { onDelete: 'cascade' })
      .$type<RankingId>(),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' })
      .$type<MemberId>(),
    position: integer('position').notNull(), // 1-basiert, lückenlos
    points: integer('points'),               // null außerhalb points-table
    eloRating: real('elo_rating'),           // null außerhalb elo/hybrid
    lastMatchAt: integer('last_match_at', { mode: 'timestamp' }),
  },
  (t) => [
    uniqueIndex('re_ranking_member_idx').on(t.rankingId, t.memberId),
    index('re_ranking_position_idx').on(t.rankingId, t.position),
  ],
)

export type RankingEntryRow = typeof rankingEntry.$inferSelect
export type RankingEntryInsert = typeof rankingEntry.$inferInsert
