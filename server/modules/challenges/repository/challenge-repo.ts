import { and, count, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { useDb } from '../../../db'
import {
  challenge,
  type ChallengeId,
  type ChallengeInsert,
  type ChallengeRow,
  type ChallengeStatus,
} from '../../../db/schema/challenge'
import type { MemberId } from '../../../db/schema/member'
import { ranking, type RankingId } from '../../../db/schema/ranking'

export const challengeRepo = {
  findById(id: ChallengeId): ChallengeRow | undefined {
    return useDb().select().from(challenge).where(eq(challenge.id, id)).get()
  },

  insert(values: ChallengeInsert): ChallengeRow {
    const rows = useDb().insert(challenge).values(values).returning().all()
    return rows[0]!
  },

  /** Atomic Transition — nur wenn aktueller Status == `from` */
  transition(
    id: ChallengeId,
    from: ChallengeStatus,
    to: ChallengeStatus,
    patch: Partial<ChallengeInsert>,
  ): ChallengeRow | undefined {
    const rows = useDb()
      .update(challenge)
      .set({ status: to, ...patch })
      .where(and(eq(challenge.id, id), eq(challenge.status, from)))
      .returning()
      .all()
    return rows[0]
  },

  countActiveByMember(memberId: MemberId): number {
    const row = useDb()
      .select({ c: count() })
      .from(challenge)
      .where(
        and(
          inArray(challenge.status, ['PROPOSED', 'ACCEPTED']),
          or(eq(challenge.challengerId, memberId), eq(challenge.challengedId, memberId)),
        ),
      )
      .get()
    return row?.c ?? 0
  },

  countCreatedSince(challengerId: MemberId, since: Date): number {
    const row = useDb()
      .select({ c: count() })
      .from(challenge)
      .where(and(eq(challenge.challengerId, challengerId), gte(challenge.createdAt, since)))
      .get()
    return row?.c ?? 0
  },

  /**
   * Existiert ein laufender oder vor `since` abgeschlossener Match zwischen
   * den beiden in IRGENDEINER Rangliste? Für Cooldown FR-26 / FR-20d.
   */
  hasRecentInteraction(a: MemberId, b: MemberId, since: Date): boolean {
    const row = useDb()
      .select({ id: challenge.id })
      .from(challenge)
      .where(
        and(
          or(
            and(eq(challenge.challengerId, a), eq(challenge.challengedId, b)),
            and(eq(challenge.challengerId, b), eq(challenge.challengedId, a)),
          ),
          // Aktiv (PROPOSED/ACCEPTED) ODER kürzlich abgeschlossen
          or(
            inArray(challenge.status, ['PROPOSED', 'ACCEPTED']),
            and(
              inArray(challenge.status, ['COMPLETED', 'DISPUTED']),
              gte(challenge.completedAt, since),
            ),
          ),
        ),
      )
      .limit(1)
      .get()
    return row !== undefined
  },

  listForMember(memberId: MemberId) {
    return useDb()
      .select()
      .from(challenge)
      .where(or(eq(challenge.challengerId, memberId), eq(challenge.challengedId, memberId)))
      .orderBy(sql`${challenge.createdAt} DESC`)
      .all()
  },

  /** Hilfe für den Reminder/Cleanup-Cron */
  findStaleByStatus(status: ChallengeStatus, olderThan: Date): ChallengeRow[] {
    return useDb()
      .select()
      .from(challenge)
      .where(and(eq(challenge.status, status), sql`${challenge.createdAt} < ${olderThan}`))
      .all()
  },

  rankingIdFor(id: ChallengeId): RankingId | undefined {
    return useDb()
      .select({ rankingId: challenge.rankingId })
      .from(challenge)
      .innerJoin(ranking, eq(challenge.rankingId, ranking.id))
      .where(eq(challenge.id, id))
      .get()?.rankingId
  },
}
