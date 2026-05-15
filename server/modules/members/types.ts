import { z } from 'zod'
import type { MatchPreferences, MemberId, Role } from '../../db/schema/member'

export type { MemberId, Role, MatchPreferences }

/** Zod-Schema für Update-Eingabe — alle Felder optional (PATCH-Semantik). */
export const matchPreferencesSchema = z.object({
  singlesChallenges: z.boolean(),
  singlesFriendly: z.boolean(),
  doublesFriendly: z.boolean(),
  mixedFriendly: z.boolean(),
  seniorsFriendly: z.boolean(),
})

export const updateOwnProfileInput = z
  .object({
    firstName: z.string().min(1).max(60),
    lastName: z.string().min(1).max(60),
    birthYear: z.number().int().gte(1920).lte(2020),
    gender: z.enum(['m', 'w']),
    dtbLk: z.number().min(1).max(25),
    status: z.enum(['aktiv', 'pausiert']),
    preferences: matchPreferencesSchema,
  })
  .partial()
  .strict()

export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileInput>

/** Public DTO — Felder, die das Frontend bekommt. */
export type MemberDto = {
  id: MemberId
  email: string
  firstName: string
  lastName: string
  birthYear: number
  gender: 'm' | 'w'
  dtbLk: number
  status: 'aktiv' | 'pausiert'
  roles: Role[]
  preferences: MatchPreferences
}
