import { sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { member, type MemberId } from './member'
import { teamTag, type TeamTagId } from './team-tag'

export const memberTeamTag = sqliteTable(
  'member_team_tag',
  {
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' })
      .$type<MemberId>(),
    teamTagId: text('team_tag_id')
      .notNull()
      .references(() => teamTag.id, { onDelete: 'cascade' })
      .$type<TeamTagId>(),
    assignedAt: integer('assigned_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    assignedBy: text('assigned_by').references(() => member.id).$type<MemberId>(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.teamTagId] })],
)

export type MemberTeamTagRow = typeof memberTeamTag.$inferSelect
export type MemberTeamTagInsert = typeof memberTeamTag.$inferInsert
