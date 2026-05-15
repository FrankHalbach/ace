import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'
import { member, type MemberId } from './member'

export type FriendlyId = Brand<number, 'FriendlyId'>

export type FriendlyFormat = 'singles' | 'doubles'

export type FriendlyMatchMode =
  | 'best-of-3-tiebreak'
  | 'best-of-3-full'
  | 'best-of-3-champions'
  | 'short-sets-tiebreak'
  | 'pro-set'

export type FriendlyStatus =
  | 'PROPOSED'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'PLAYED'
  | 'COMPLETED'
  | 'DISPUTED'

export const friendly = sqliteTable(
  'friendly',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).$type<FriendlyId>(),
    initiatorId: integer('initiator_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' })
      .$type<MemberId>(),
    format: text('format', { enum: ['singles', 'doubles'] }).notNull(),
    scheduledAt: integer('scheduled_at', { mode: 'timestamp' }).notNull(),
    courtInfo: text('court_info'),
    note: text('note'),
    matchMode: text('match_mode', {
      enum: [
        'best-of-3-tiebreak',
        'best-of-3-full',
        'best-of-3-champions',
        'short-sets-tiebreak',
        'pro-set',
      ],
    }).notNull(),

    status: text('status', {
      enum: ['PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'PLAYED', 'COMPLETED', 'DISPUTED'],
    })
      .notNull()
      .default('PROPOSED'),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
    declinedAt: integer('declined_at', { mode: 'timestamp' }),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),
    playedAt: integer('played_at', { mode: 'timestamp' }),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    disputedAt: integer('disputed_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('friendly_initiator_status_idx').on(t.initiatorId, t.status),
    index('friendly_scheduled_idx').on(t.scheduledAt),
  ],
)

export type FriendlyRow = typeof friendly.$inferSelect
export type FriendlyInsert = typeof friendly.$inferInsert
