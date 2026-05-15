import { and, count, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { useDb } from '../../../db'
import {
  friendly,
  type FriendlyId,
  type FriendlyInsert,
  type FriendlyRow,
  type FriendlyStatus,
} from '../../../db/schema/friendly'
import { friendlyInvitee } from '../../../db/schema/friendly-invitee'
import type { MemberId } from '../../../db/schema/member'

export const friendlyRepo = {
  findById(id: FriendlyId): FriendlyRow | undefined {
    return useDb().select().from(friendly).where(eq(friendly.id, id)).get()
  },

  insert(values: FriendlyInsert): FriendlyRow {
    const rows = useDb().insert(friendly).values(values).returning().all()
    return rows[0]!
  },

  /** Atomic Transition — nur wenn aktueller Status `from` ist. */
  transition(
    id: FriendlyId,
    from: FriendlyStatus | FriendlyStatus[],
    to: FriendlyStatus,
    patch: Partial<FriendlyInsert>,
  ): FriendlyRow | undefined {
    const fromCondition = Array.isArray(from)
      ? inArray(friendly.status, from)
      : eq(friendly.status, from)
    const rows = useDb()
      .update(friendly)
      .set({ status: to, ...patch })
      .where(and(eq(friendly.id, id), fromCondition))
      .returning()
      .all()
    return rows[0]
  },

  countCreatedSince(initiatorId: MemberId, since: Date): number {
    const row = useDb()
      .select({ c: count() })
      .from(friendly)
      .where(and(eq(friendly.initiatorId, initiatorId), gte(friendly.createdAt, since)))
      .get()
    return row?.c ?? 0
  },

  /**
   * Liste aller Friendlies, in denen `memberId` Initiator ODER Eingeladener ist —
   * absteigend nach `scheduledAt` sortiert.
   */
  listForMember(memberId: MemberId): FriendlyRow[] {
    const inviteeIds = useDb()
      .select({ friendlyId: friendlyInvitee.friendlyId })
      .from(friendlyInvitee)
      .where(eq(friendlyInvitee.memberId, memberId))
    return useDb()
      .select()
      .from(friendly)
      .where(
        or(eq(friendly.initiatorId, memberId), inArray(friendly.id, inviteeIds)),
      )
      .orderBy(sql`${friendly.scheduledAt} DESC`)
      .all()
  },
}
