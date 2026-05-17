import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'
import { member, type MemberId } from './member'
import { ranking, type RankingId } from './ranking'

export type ChallengeId = Brand<number, 'ChallengeId'>

export type ChallengeStatus =
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'CANCELLED'

export type DeclineReason = 'injury' | 'vacation' | 'work' | 'other'

export const challenge = sqliteTable(
  'challenge',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).$type<ChallengeId>(),
    challengerId: text('challenger_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' })
      .$type<MemberId>(),
    challengedId: text('challenged_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' })
      .$type<MemberId>(),
    rankingId: text('ranking_id')
      .notNull()
      .references(() => ranking.id, { onDelete: 'cascade' })
      .$type<RankingId>(),
    status: text('status', {
      enum: ['PROPOSED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'COMPLETED', 'DISPUTED', 'CANCELLED'],
    })
      .notNull()
      .default('PROPOSED'),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
    declinedAt: integer('declined_at', { mode: 'timestamp' }),
    expiredAt: integer('expired_at', { mode: 'timestamp' }),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    disputedAt: integer('disputed_at', { mode: 'timestamp' }),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),

    declineReason: text('decline_reason', { enum: ['injury', 'vacation', 'work', 'other'] }),
    declineNote: text('decline_note'),
  },
  (t) => [
    index('challenge_challenger_status_idx').on(t.challengerId, t.status),
    index('challenge_challenged_status_idx').on(t.challengedId, t.status),
    index('challenge_pair_created_idx').on(t.challengerId, t.challengedId, t.createdAt),
  ],
)

export type ChallengeRow = typeof challenge.$inferSelect
export type ChallengeInsert = typeof challenge.$inferInsert
