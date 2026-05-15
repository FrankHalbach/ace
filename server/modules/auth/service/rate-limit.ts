import { rateLimitRepo } from '../repository/rate-limit-repo'
import { RateLimitExceededError } from '../types'

/**
 * Spec FR-114: maximal 3 Magic-Link-Anfragen pro Stunde pro Email-Adresse.
 *
 * Generisches Interface, damit wir später Challenge- und Friendly-Limits
 * (FR-110, FR-113) wiederverwenden können.
 */
export type RateLimitConfig = {
  /** Stable Key — z. B. `magic-link:max@neureut.de` */
  key: string
  /** Wie viele Events in dem Fenster maximal erlaubt sind */
  limit: number
  /** Länge des rolling window in Millisekunden */
  windowMs: number
}

/**
 * Default 3/h gemäß Spec. Per Env überschreibbar — vor allem für lokale
 * Entwicklung sinnvoll (z. B. `NUXT_AUTH_MAGIC_LINK_LIMIT_PER_HOUR=100`).
 */
export const MAGIC_LINK_RATE_LIMIT: Omit<RateLimitConfig, 'key'> = {
  limit: Number(process.env.NUXT_AUTH_MAGIC_LINK_LIMIT_PER_HOUR) || 3,
  windowMs: 60 * 60 * 1000, // 1 Stunde
}

export const rateLimitService = {
  /** Prüft das Limit. Wirft `RateLimitExceededError`, wenn überschritten. */
  enforce(config: RateLimitConfig, now: Date = new Date()): void {
    const since = new Date(now.getTime() - config.windowMs)
    const used = rateLimitRepo.countSince(config.key, since)
    if (used >= config.limit) {
      throw new RateLimitExceededError(config.key)
    }
    rateLimitRepo.record(config.key, now)
  },

  /** Magic-Link-Spezialisierung. */
  enforceMagicLink(email: string, now?: Date): void {
    rateLimitService.enforce(
      {
        key: `magic-link:${email.toLowerCase()}`,
        limit: MAGIC_LINK_RATE_LIMIT.limit,
        windowMs: MAGIC_LINK_RATE_LIMIT.windowMs,
      },
      now,
    )
  },
}
