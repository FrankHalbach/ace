import { and, count, eq, gte } from 'drizzle-orm'
import { useDb } from '../../../db'
import { rateLimitEvent } from '../../../db/schema/rate-limit-event'

export const rateLimitRepo = {
  countSince(key: string, since: Date): number {
    const row = useDb()
      .select({ c: count() })
      .from(rateLimitEvent)
      .where(and(eq(rateLimitEvent.key, key), gte(rateLimitEvent.occurredAt, since)))
      .get()
    return row?.c ?? 0
  },

  record(key: string, at: Date = new Date()): void {
    useDb().insert(rateLimitEvent).values({ key, occurredAt: at }).run()
  },
}
