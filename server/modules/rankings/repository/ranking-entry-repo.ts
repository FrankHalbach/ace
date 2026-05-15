import { count, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { member, type MemberId } from '../../../db/schema/member'
import { ranking, type RankingId } from '../../../db/schema/ranking'
import {
  rankingEntry,
  type RankingEntryInsert,
  type RankingEntryRow,
} from '../../../db/schema/ranking-entry'

export const rankingEntryRepo = {
  insertMany(values: RankingEntryInsert[]): void {
    if (values.length === 0) return
    useDb().insert(rankingEntry).values(values).run()
  },

  listByRanking(rankingId: RankingId): RankingEntryRow[] {
    return useDb()
      .select()
      .from(rankingEntry)
      .where(eq(rankingEntry.rankingId, rankingId))
      .orderBy(rankingEntry.position)
      .all()
  },

  /** Liefert Einträge zusammen mit Member-Stammdaten — eine Query, ein JOIN. */
  listByRankingWithMember(rankingId: RankingId) {
    return useDb()
      .select({
        entry: rankingEntry,
        memberFirstName: member.firstName,
        memberLastName: member.lastName,
        memberLk: member.dtbLk,
        memberStatus: member.status,
      })
      .from(rankingEntry)
      .innerJoin(member, eq(rankingEntry.memberId, member.id))
      .where(eq(rankingEntry.rankingId, rankingId))
      .orderBy(rankingEntry.position)
      .all()
  },

  /**
   * Alle Rangliste-Plätze eines Mitglieds — inklusive Ranking-Metadaten,
   * über JOIN. Nutzbar für FR-14 „transparent im Profil".
   */
  listByMember(memberId: MemberId) {
    return useDb()
      .select({
        entry: rankingEntry,
        ranking: ranking,
      })
      .from(rankingEntry)
      .innerJoin(ranking, eq(rankingEntry.rankingId, ranking.id))
      .where(eq(rankingEntry.memberId, memberId))
      .all()
  },

  countByRanking(rankingId: RankingId): number {
    const row = useDb()
      .select({ c: count() })
      .from(rankingEntry)
      .where(eq(rankingEntry.rankingId, rankingId))
      .get()
    return row?.c ?? 0
  },
}
