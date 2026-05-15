import { eq, lt, and } from 'drizzle-orm'
import { useDb } from '../../../db'
import {
  matchResult,
  type MatchResultId,
  type MatchResultInsert,
  type MatchResultRow,
} from '../../../db/schema/match-result'
import type { ChallengeId } from '../../../db/schema/challenge'

export const matchResultRepo = {
  findById(id: MatchResultId): MatchResultRow | undefined {
    return useDb().select().from(matchResult).where(eq(matchResult.id, id)).get()
  },

  findByChallenge(challengeId: ChallengeId): MatchResultRow | undefined {
    return useDb().select().from(matchResult).where(eq(matchResult.challengeId, challengeId)).get()
  },

  insert(values: MatchResultInsert): MatchResultRow {
    const rows = useDb().insert(matchResult).values(values).returning().all()
    return rows[0]!
  },

  updateById(id: MatchResultId, patch: Partial<MatchResultInsert>): MatchResultRow | undefined {
    const rows = useDb()
      .update(matchResult)
      .set(patch)
      .where(eq(matchResult.id, id))
      .returning()
      .all()
    return rows[0]
  },

  findStalePending(olderThan: Date): MatchResultRow[] {
    return useDb()
      .select()
      .from(matchResult)
      .where(
        and(
          eq(matchResult.confirmationStatus, 'pending'),
          lt(matchResult.reportedAt, olderThan),
        ),
      )
      .all()
  },
}
