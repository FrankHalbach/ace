import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'
import { challenge, type ChallengeId } from './challenge'
import { member, type MemberId } from './member'

export type MatchResultId = Brand<number, 'MatchResultId'>

export type MatchMode =
  | 'two-sets-match-tiebreak'
  | 'best-of-3-tiebreak'
  | 'best-of-3-full'
  | 'best-of-3-champions'
  | 'short-sets-tiebreak'
  | 'pro-set'

export type SetScore = { a: number; b: number }

export type ConfirmationStatus = 'pending' | 'confirmed' | 'disputed'

/**
 * Wie das Match endete (Issues #29 / #30):
 *   - regular:    vollständig durchgespielt, regulärer Score
 *   - walkover:   Spieler erschien nicht / zog zurück (kein Score)
 *   - retirement: Spieler brach während des Matches ab (Teilscore möglich)
 */
export type MatchOutcome = 'regular' | 'walkover' | 'retirement'

export const matchResult = sqliteTable(
  'match_result',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).$type<MatchResultId>(),
    challengeId: integer('challenge_id')
      .notNull()
      .references(() => challenge.id, { onDelete: 'cascade' })
      .$type<ChallengeId>(),

    winnerId: integer('winner_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' })
      .$type<MemberId>(),
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
    reportedBy: integer('reported_by')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' })
      .$type<MemberId>(),

    confirmationStatus: text('confirmation_status', {
      enum: ['pending', 'confirmed', 'disputed'],
    })
      .notNull()
      .default('pending'),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
    disputedAt: integer('disputed_at', { mode: 'timestamp' }),
    disputeNote: text('dispute_note'),

    outcome: text('outcome', { enum: ['regular', 'walkover', 'retirement'] })
      .notNull()
      .default('regular'),
    outcomeNote: text('outcome_note'),

    applied: integer('applied', { mode: 'boolean' }).notNull().default(false),
    appliedAt: integer('applied_at', { mode: 'timestamp' }),
  },
  (t) => [uniqueIndex('match_result_challenge_idx').on(t.challengeId)],
)

export type MatchResultRow = typeof matchResult.$inferSelect
export type MatchResultInsert = typeof matchResult.$inferInsert
