import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import {
  friendlyInvitee,
  type FriendlyInviteeInsert,
  type FriendlyInviteeRow,
  type FriendlyInviteeStatus,
} from '../../../db/schema/friendly-invitee'
import type { FriendlyId } from '../../../db/schema/friendly'
import type { MemberId } from '../../../db/schema/member'

export const friendlyInviteeRepo = {
  insertMany(values: FriendlyInviteeInsert[]): FriendlyInviteeRow[] {
    return useDb().insert(friendlyInvitee).values(values).returning().all()
  },

  listByFriendly(friendlyId: FriendlyId): FriendlyInviteeRow[] {
    return useDb()
      .select()
      .from(friendlyInvitee)
      .where(eq(friendlyInvitee.friendlyId, friendlyId))
      .all()
  },

  findOne(friendlyId: FriendlyId, memberId: MemberId): FriendlyInviteeRow | undefined {
    return useDb()
      .select()
      .from(friendlyInvitee)
      .where(
        and(
          eq(friendlyInvitee.friendlyId, friendlyId),
          eq(friendlyInvitee.memberId, memberId),
        ),
      )
      .get()
  },

  /**
   * Status eines Invitees setzen — gibt das aktualisierte Row-Objekt
   * zurück, oder `undefined`, wenn kein passender Invitee existiert.
   */
  setStatus(
    friendlyId: FriendlyId,
    memberId: MemberId,
    status: FriendlyInviteeStatus,
    respondedAt: Date,
  ): FriendlyInviteeRow | undefined {
    const rows = useDb()
      .update(friendlyInvitee)
      .set({ status, respondedAt })
      .where(
        and(
          eq(friendlyInvitee.friendlyId, friendlyId),
          eq(friendlyInvitee.memberId, memberId),
        ),
      )
      .returning()
      .all()
    return rows[0]
  },
}
