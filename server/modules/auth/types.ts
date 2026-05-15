import { z } from 'zod'
import type { MemberId, Role } from '../members'

export type { MemberId, Role }

/** Inhalt des Session-Cookies (nuxt-auth-utils). */
export type SessionUser = {
  memberId: MemberId
  roles: Role[]
}

export const requestLinkInput = z.object({
  email: z.string().email().max(120),
})

export type RequestLinkInput = z.infer<typeof requestLinkInput>

export class RateLimitExceededError extends Error {
  readonly code = 'auth.rate-limit-exceeded' as const
  constructor(public readonly key: string) {
    super(`rate limit exceeded for ${key}`)
  }
}

export class InvalidTokenError extends Error {
  readonly code = 'auth.invalid-token' as const
  constructor(public readonly reason: 'unknown' | 'expired' | 'consumed') {
    super(`magic-link token ${reason}`)
  }
}
