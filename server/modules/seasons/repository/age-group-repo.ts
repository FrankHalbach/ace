import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { ageGroup, type AgeGroupId, type AgeGroupInsert, type AgeGroupRow } from '../../../db/schema/age-group'
import type { SeasonId } from '../../../db/schema/season'

export const ageGroupRepo = {
  listBySeason(seasonId: SeasonId): AgeGroupRow[] {
    return useDb()
      .select()
      .from(ageGroup)
      .where(eq(ageGroup.seasonId, seasonId))
      .orderBy(ageGroup.name)
      .all()
  },

  findById(id: AgeGroupId): AgeGroupRow | undefined {
    return useDb().select().from(ageGroup).where(eq(ageGroup.id, id)).get()
  },

  findByName(seasonId: SeasonId, name: string): AgeGroupRow | undefined {
    return useDb()
      .select()
      .from(ageGroup)
      .where(and(eq(ageGroup.seasonId, seasonId), eq(ageGroup.name, name)))
      .get()
  },

  insert(values: AgeGroupInsert): AgeGroupRow {
    const rows = useDb().insert(ageGroup).values(values).returning().all()
    return rows[0]!
  },

  updateById(id: AgeGroupId, patch: Partial<AgeGroupInsert>): AgeGroupRow | undefined {
    const rows = useDb()
      .update(ageGroup)
      .set(patch)
      .where(eq(ageGroup.id, id))
      .returning()
      .all()
    return rows[0]
  },

  deleteById(id: AgeGroupId): number {
    return useDb().delete(ageGroup).where(eq(ageGroup.id, id)).run().changes
  },
}
