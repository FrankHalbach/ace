import { sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Brand } from '../../shared/branded'

export type MemberId = Brand<number, 'MemberId'>

export type Role = 'player' | 'trainer' | 'admin'

export type MatchPreferences = {
  singlesChallenges: boolean
  singlesFriendly: boolean
  doublesFriendly: boolean
  mixedFriendly: boolean
  seniorsFriendly: boolean
}

export const DEFAULT_PREFERENCES: MatchPreferences = {
  singlesChallenges: true,
  singlesFriendly: true,
  doublesFriendly: false,
  mixedFriendly: false,
  seniorsFriendly: false,
}

export const member = sqliteTable(
  'member',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).$type<MemberId>(),
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
    lastFriendlyAt: integer('last_friendly_at', { mode: 'timestamp' }),
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
