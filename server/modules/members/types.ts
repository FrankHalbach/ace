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

// Set-Score (lokal redefiniert, um keine Cross-Modul-Type-Imports zu erzwingen).
type SetScore = { a: number; b: number }

/** Voll aggregiertes Spieler-Profil — Header + Ranglisten + Match-Historie. */
export type PlayerProfileDto = {
  id: MemberId
  firstName: string
  lastName: string
  birthYear: number
  gender: 'm' | 'w'
  dtbLk: number
  status: 'aktiv' | 'pausiert'
  /** Nur fürs eigene Profil befüllt — sonst null (FR-7-Defaults v1). */
  email: string | null

  lastMatchAt: Date | null
  matchesLast4Weeks: number

  rankings: Array<{
    rankingId: number
    seasonName: string
    ageGroupName: string
    variant: 'herren' | 'damen' | 'offen'
    mode: 'pyramid' | 'elo' | 'hybrid' | 'points-table'
    position: number
    entryCount: number
  }>

  matches: Array<
    | {
        kind: 'challenge'
        challengeId: number
        rankingName: string
        opponentId: MemberId
        opponentName: string
        result: 'win' | 'loss'
        sets: SetScore[]
        completedAt: Date
      }
    | {
        kind: 'friendly'
        friendlyId: number
        format: 'singles' | 'doubles'
        partnerId: MemberId | null
        partnerName: string | null
        opponentIds: MemberId[]
        opponentNames: string[]
        result: 'win' | 'loss' | null
        sets: SetScore[]
        playedOrCompletedAt: Date
      }
  >
}
