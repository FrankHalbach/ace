import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import {
  ranking,
  type RankingId,
  type RankingInsert,
  type RankingRow,
} from '../../../db/schema/ranking'
import type { SeasonId } from '../../../db/schema/season'

export const rankingRepo = {
  findById(id: RankingId): RankingRow | undefined {
    return useDb().select().from(ranking).where(eq(ranking.id, id)).get()
  },

  listBySeason(seasonId: SeasonId): RankingRow[] {
    return useDb()
      .select()
      .from(ranking)
      .where(eq(ranking.seasonId, seasonId))
      .orderBy(ranking.ageGroupId)
      .all()
  },

  list(): RankingRow[] {
    return useDb().select().from(ranking).all()
  },

  findExact(seasonId: SeasonId, ageGroupId: number): RankingRow | undefined {
    return useDb()
      .select()
      .from(ranking)
      .where(
        and(
          eq(ranking.seasonId, seasonId),
          eq(ranking.ageGroupId, ageGroupId as never),
        ),
      )
      .get()
  },

  insert(values: RankingInsert): RankingRow {
    const rows = useDb().insert(ranking).values(values).returning().all()
    return rows[0]!
  },
}
