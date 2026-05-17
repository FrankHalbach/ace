import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'
import { friendly, type FriendlyId } from './friendly'
import { member, type MemberId } from './member'

export type FriendlyInviteeId = Brand<number, 'FriendlyInviteeId'>

export type FriendlyInviteeTeam = 'initiator' | 'opponent'
export type FriendlyInviteeStatus = 'pending' | 'accepted' | 'declined'

export const friendlyInvitee = sqliteTable(
  'friendly_invitee',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).$type<FriendlyInviteeId>(),
    friendlyId: integer('friendly_id')
      .notNull()
      .references(() => friendly.id, { onDelete: 'cascade' })
      .$type<FriendlyId>(),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' })
      .$type<MemberId>(),

    team: text('team', { enum: ['initiator', 'opponent'] }).notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'declined'] })
      .notNull()
      .default('pending'),
    respondedAt: integer('responded_at', { mode: 'timestamp' }),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('friendly_invitee_unique').on(t.friendlyId, t.memberId),
    index('friendly_invitee_member_status_idx').on(t.memberId, t.status),
  ],
)

export type FriendlyInviteeRow = typeof friendlyInvitee.$inferSelect
export type FriendlyInviteeInsert = typeof friendlyInvitee.$inferInsert
