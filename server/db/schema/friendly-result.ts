import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'
import { friendly, type FriendlyId } from './friendly'
import { member, type MemberId } from './member'
import type { ConfirmationStatus, MatchMode, MatchOutcome, SetScore } from './match-result'

export type FriendlyResultId = Brand<number, 'FriendlyResultId'>

export type { ConfirmationStatus, MatchMode, MatchOutcome, SetScore }

export const friendlyResult = sqliteTable(
  'friendly_result',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).$type<FriendlyResultId>(),
    friendlyId: integer('friendly_id')
      .notNull()
      .references(() => friendly.id, { onDelete: 'cascade' })
      .$type<FriendlyId>(),

    // Singles: ein Sieger. Doubles: zwei Sieger (Sieger-Team).
    winnerMemberIds: text('winner_member_ids', { mode: 'json' })
      .$type<MemberId[]>()
      .notNull(),

    sets: text('sets', { mode: 'json' }).$type<SetScore[]>().notNull(),
    matchMode: text('match_mode', {
      enum: [
        'two-sets-match-tiebreak',
        'best-of-3-tiebreak',
        'best-of-3-full',
        'best-of-3-champions',
        'short-sets-tiebreak',
        'pro-set',
      ],
    }).notNull(),

    reportedAt: integer('reported_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    reportedBy: text('reported_by')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' })
      .$type<MemberId>(),

    confirmationStatus: text('confirmation_status', {
      enum: ['pending', 'confirmed', 'disputed'],
    })
      .notNull()
      .default('pending'),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
    confirmedBy: text('confirmed_by')
      .references(() => member.id, { onDelete: 'set null' })
      .$type<MemberId>(),
    disputedAt: integer('disputed_at', { mode: 'timestamp' }),
    disputeNote: text('dispute_note'),

    outcome: text('outcome', { enum: ['regular', 'walkover', 'retirement'] })
      .notNull()
      .default('regular'),
    outcomeNote: text('outcome_note'),
  },
  (t) => [uniqueIndex('friendly_result_friendly_idx').on(t.friendlyId)],
)

export type FriendlyResultRow = typeof friendlyResult.$inferSelect
export type FriendlyResultInsert = typeof friendlyResult.$inferInsert
