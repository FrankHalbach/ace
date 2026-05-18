import { asc, eq, sql } from 'drizzle-orm'
import { useDb } from '../../../db'
import { member } from '../../../db/schema/member'
import {
  teamTag,
  type TeamTagId,
  type TeamTagInsert,
  type TeamTagRow,
} from '../../../db/schema/team-tag'
import {
  memberTeamTag,
  type MemberTeamTagRow,
} from '../../../db/schema/member-team-tag'
import type { MemberId } from '../../members'

export type TeamMemberRow = {
  id: MemberId
  firstName: string
  lastName: string
  gender: 'm' | 'w'
  dtbLk: number
  status: 'aktiv' | 'pausiert'
  assignedAt: Date
}

export const teamTagRepo = {
  listAll(): TeamTagRow[] {
    return useDb()
      .select()
      .from(teamTag)
      .orderBy(asc(teamTag.sortOrder), asc(teamTag.name))
      .all()
  },

  findById(id: TeamTagId): TeamTagRow | undefined {
    return useDb().select().from(teamTag).where(eq(teamTag.id, id)).get()
  },

  findByNameLower(name: string): TeamTagRow | undefined {
    return useDb()
      .select()
      .from(teamTag)
      .where(sql`lower(${teamTag.name}) = ${name.trim().toLowerCase()}`)
      .get()
  },

  insert(values: TeamTagInsert): TeamTagRow {
    const rows = useDb().insert(teamTag).values(values).returning().all()
    return rows[0]!
  },

  updateById(
    id: TeamTagId,
    patch: Partial<TeamTagInsert>,
  ): TeamTagRow | undefined {
    const rows = useDb()
      .update(teamTag)
      .set(patch)
      .where(eq(teamTag.id, id))
      .returning()
      .all()
    return rows[0]
  },

  deleteById(id: TeamTagId): void {
    useDb().delete(teamTag).where(eq(teamTag.id, id)).run()
  },

  listForMember(memberId: MemberId): TeamTagRow[] {
    return useDb()
      .select({
        id: teamTag.id,
        name: teamTag.name,
        sortOrder: teamTag.sortOrder,
        active: teamTag.active,
        createdAt: teamTag.createdAt,
      })
      .from(memberTeamTag)
      .innerJoin(teamTag, eq(memberTeamTag.teamTagId, teamTag.id))
      .where(eq(memberTeamTag.memberId, memberId))
      .orderBy(asc(teamTag.sortOrder), asc(teamTag.name))
      .all()
  },

  listMembersForTag(tagId: TeamTagId): TeamMemberRow[] {
    return useDb()
      .select({
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        gender: member.gender,
        dtbLk: member.dtbLk,
        status: member.status,
        assignedAt: memberTeamTag.assignedAt,
      })
      .from(memberTeamTag)
      .innerJoin(member, eq(memberTeamTag.memberId, member.id))
      .where(eq(memberTeamTag.teamTagId, tagId))
      .orderBy(asc(member.lastName), asc(member.firstName))
      .all()
  },

  listAssignments(memberId: MemberId): MemberTeamTagRow[] {
    return useDb()
      .select()
      .from(memberTeamTag)
      .where(eq(memberTeamTag.memberId, memberId))
      .all()
  },

  deleteAssignmentsForMember(memberId: MemberId): void {
    useDb()
      .delete(memberTeamTag)
      .where(eq(memberTeamTag.memberId, memberId))
      .run()
  },

  insertAssignments(
    rows: { memberId: MemberId; teamTagId: TeamTagId; assignedBy: MemberId }[],
  ): void {
    if (rows.length === 0) return
    useDb().insert(memberTeamTag).values(rows).run()
  },
}
