import { eq, sql } from 'drizzle-orm'
import { useDb } from '../../../db'
import { member, type MemberId, type MemberInsert, type MemberRow } from '../../../db/schema/member'

export const memberRepo = {
  findByEmail(email: string): MemberRow | undefined {
    return useDb()
      .select()
      .from(member)
      .where(sql`lower(${member.email}) = ${email.toLowerCase()}`)
      .get()
  },

  findById(id: MemberId): MemberRow | undefined {
    return useDb().select().from(member).where(eq(member.id, id)).get()
  },

  insert(values: MemberInsert): MemberRow {
    const rows = useDb().insert(member).values(values).returning().all()
    return rows[0]!
  },

  updateById(id: MemberId, patch: Partial<MemberInsert>): MemberRow | undefined {
    const rows = useDb()
      .update(member)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(member.id, id))
      .returning()
      .all()
    return rows[0]
  },
}
