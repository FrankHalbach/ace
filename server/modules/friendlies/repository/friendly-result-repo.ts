import { and, eq, lt } from 'drizzle-orm'
import { useDb } from '../../../db'
import {
  friendlyResult,
  type FriendlyResultId,
  type FriendlyResultInsert,
  type FriendlyResultRow,
} from '../../../db/schema/friendly-result'
import type { FriendlyId } from '../../../db/schema/friendly'

export const friendlyResultRepo = {
  findById(id: FriendlyResultId): FriendlyResultRow | undefined {
    return useDb().select().from(friendlyResult).where(eq(friendlyResult.id, id)).get()
  },

  findByFriendly(friendlyId: FriendlyId): FriendlyResultRow | undefined {
    return useDb()
      .select()
      .from(friendlyResult)
      .where(eq(friendlyResult.friendlyId, friendlyId))
      .get()
  },

  insert(values: FriendlyResultInsert): FriendlyResultRow {
    const rows = useDb().insert(friendlyResult).values(values).returning().all()
    return rows[0]!
  },

  updateById(
    id: FriendlyResultId,
    patch: Partial<FriendlyResultInsert>,
  ): FriendlyResultRow | undefined {
    const rows = useDb()
      .update(friendlyResult)
      .set(patch)
      .where(eq(friendlyResult.id, id))
      .returning()
      .all()
    return rows[0]
  },

  findStalePending(olderThan: Date): FriendlyResultRow[] {
    return useDb()
      .select()
      .from(friendlyResult)
      .where(
        and(
          eq(friendlyResult.confirmationStatus, 'pending'),
          lt(friendlyResult.reportedAt, olderThan),
        ),
      )
      .all()
  },
}
