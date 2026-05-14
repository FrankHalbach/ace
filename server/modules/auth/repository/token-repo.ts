import { eq, lt } from 'drizzle-orm'
import { useDb } from '../../../db'
import {
  magicLinkToken,
  type MagicLinkTokenInsert,
  type MagicLinkTokenRow,
} from '../../../db/schema/magic-link-token'

export const tokenRepo = {
  insert(values: MagicLinkTokenInsert): MagicLinkTokenRow {
    const rows = useDb().insert(magicLinkToken).values(values).returning().all()
    return rows[0]!
  },

  findByToken(token: string): MagicLinkTokenRow | undefined {
    return useDb().select().from(magicLinkToken).where(eq(magicLinkToken.token, token)).get()
  },

  markConsumed(token: string): void {
    useDb()
      .update(magicLinkToken)
      .set({ consumedAt: new Date() })
      .where(eq(magicLinkToken.token, token))
      .run()
  },

  deleteExpired(now: Date = new Date()): number {
    const result = useDb().delete(magicLinkToken).where(lt(magicLinkToken.expiresAt, now)).run()
    return result.changes
  },
}
