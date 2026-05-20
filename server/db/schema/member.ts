import { sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'
import { newPublicId } from '../../shared/public-id'

export type MemberId = Brand<string, 'MemberId'>

export type Role = 'player' | 'trainer' | 'admin'

export type MatchPreferences = {
  singlesChallenges: boolean
  singlesFriendly: boolean
  doublesFriendly: boolean
  mixedFriendly: boolean
  ageGroupFriendly: boolean
}

export const DEFAULT_PREFERENCES: MatchPreferences = {
  singlesChallenges: true,
  singlesFriendly: true,
  doublesFriendly: false,
  mixedFriendly: false,
  ageGroupFriendly: false,
}

// FR-70: alle Lifecycle-Events, für die ein Spieler Email bekommt.
// Konsumiert vom notifications-Modul; hier definiert, weil Default-Werte
// auf der Schema-Spalte hängen.
export const NOTIFICATION_KEYS = [
  'challenge.received',
  'challenge.accepted',
  'challenge.declined',
  'challenge.expired',
  'challenge.result_reported',
  'challenge.result_confirmed',
  'challenge.result_disputed',
  'friendly.invited',
  'friendly.accepted',
  'friendly.declined',
  'friendly.cancelled',
  'friendly.result_reported',
  'friendly.result_confirmed',
  'friendly.result_disputed',
] as const

export type NotificationKey = (typeof NOTIFICATION_KEYS)[number]
export type NotificationPrefs = Record<NotificationKey, boolean>

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = Object.fromEntries(
  NOTIFICATION_KEYS.map((k) => [k, true]),
) as NotificationPrefs

export const member = sqliteTable(
  'member',
  {
    id: text('id').primaryKey().$type<MemberId>().$defaultFn(() => newPublicId() as MemberId),
    email: text('email').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    birthYear: integer('birth_year').notNull(),
    gender: text('gender', { enum: ['m', 'w'] }).notNull(),
    dtbLk: real('dtb_lk').notNull().default(25.0),
    status: text('status', { enum: ['aktiv', 'pausiert'] }).notNull().default('aktiv'),
    roles: text('roles', { mode: 'json' }).$type<Role[]>().notNull().default(['player']),
    preferences: text('preferences', { mode: 'json' })
      .$type<MatchPreferences>()
      .notNull()
      .default(DEFAULT_PREFERENCES),
    notificationPrefs: text('notification_prefs', { mode: 'json' })
      .$type<NotificationPrefs>()
      .notNull()
      .default(DEFAULT_NOTIFICATION_PREFS),
    lastFriendlyAt: integer('last_friendly_at', { mode: 'timestamp' }),
    deactivatedAt: integer('deactivated_at', { mode: 'timestamp' }),
    deactivationReason: text('deactivation_reason'),
    invitedAt: integer('invited_at', { mode: 'timestamp' }),
    invitedBy: text('invited_by').$type<MemberId>(),
    firstLoginAt: integer('first_login_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex('member_email_lower_idx').on(sql`lower(${t.email})`)],
)

export type MemberRow = typeof member.$inferSelect
export type MemberInsert = typeof member.$inferInsert
