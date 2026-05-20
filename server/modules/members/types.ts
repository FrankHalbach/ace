import { z } from 'zod'
import type {
  MatchPreferences,
  MemberId,
  NotificationKey,
  NotificationPrefs,
  Role,
} from '../../db/schema/member'
import { NOTIFICATION_KEYS } from '../../db/schema/member'

export type { MemberId, Role, MatchPreferences, NotificationKey, NotificationPrefs }

/** Zod-Schema für Update-Eingabe — alle Felder optional (PATCH-Semantik). */
export const matchPreferencesSchema = z.object({
  singlesChallenges: z.boolean(),
  singlesFriendly: z.boolean(),
  doublesFriendly: z.boolean(),
  mixedFriendly: z.boolean(),
  ageGroupFriendly: z.boolean(),
})

// Eine partielle Notif-Prefs-Map; der Service merged mit den bestehenden Werten,
// damit Frontend nur die geänderten Keys zu schicken braucht.
export const notificationPrefsSchema = z
  .object(
    Object.fromEntries(NOTIFICATION_KEYS.map((k) => [k, z.boolean()])) as Record<
      NotificationKey,
      z.ZodBoolean
    >,
  )
  .partial()
  .strict()

export const updateOwnProfileInput = z
  .object({
    firstName: z.string().min(1).max(60),
    lastName: z.string().min(1).max(60),
    birthYear: z.number().int().gte(1920).lte(2020),
    gender: z.enum(['m', 'w']),
    dtbLk: z.number().min(1).max(25),
    status: z.enum(['aktiv', 'pausiert']),
    preferences: matchPreferencesSchema,
    notificationPrefs: notificationPrefsSchema,
  })
  .partial()
  .strict()

export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileInput>

/**
 * Schmaler DTO für das notifications-Modul: enthält die Felder, die zum
 * Dispatchen einer Mail nötig sind, ohne den vollen `MemberDto` aufzuweichen
 * (Email bleibt dort absichtlich verborgen, siehe Spec § 4 FR-7).
 */
export type Recipient = {
  id: MemberId
  email: string
  firstName: string
  lastName: string
  isActive: boolean
  prefs: NotificationPrefs
}

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
  notificationPrefs: NotificationPrefs
}

/**
 * Erweiterter DTO fuer die Admin-Mitgliederliste — enthaelt Felder, die
 * Spielern untereinander nicht sichtbar sind (Lifecycle-Zeitstempel,
 * Deaktivierungs-Markierung).
 */
export type MemberAdminDto = MemberDto & {
  deactivatedAt: Date | null
  deactivationReason: string | null
  invitedAt: Date | null
  firstLoginAt: Date | null
}

const ROLE_ENUM = z.enum(['player', 'trainer', 'admin'])

export const setRolesInput = z.object({
  roles: z.array(ROLE_ENUM).min(1).max(3),
})

export type SetRolesInput = z.infer<typeof setRolesInput>

export const setLkInput = z.object({
  dtbLk: z.number().min(1).max(25),
  note: z.string().trim().max(500).optional(),
})

export type SetLkInput = z.infer<typeof setLkInput>

export const deactivateMemberInput = z.object({
  reason: z.string().trim().max(500).optional(),
})

export type DeactivateMemberInput = z.infer<typeof deactivateMemberInput>

const currentYear = new Date().getFullYear()

export const createMemberInput = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  birthYear: z.number().int().gte(1920).lte(currentYear),
  gender: z.enum(['m', 'w']),
  email: z.string().trim().toLowerCase().email().max(120),
  dtbLk: z.number().min(1).max(25),
})

export type CreateMemberInput = z.infer<typeof createMemberInput>

export class MustKeepPlayerRoleError extends Error {
  readonly code = 'member.must-keep-player-role' as const
  constructor() {
    super('player role must remain on every member')
  }
}

export class CannotRemoveLastAdminError extends Error {
  readonly code = 'member.cannot-remove-last-admin' as const
  constructor() {
    super('at least one active admin must remain')
  }
}

export class MemberDuplicateEmailError extends Error {
  readonly code = 'member.duplicate-email' as const
  constructor(public readonly email: string) {
    super(`member with email ${email} already exists`)
  }
}

export class LkOutOfRangeError extends Error {
  readonly code = 'lk.out-of-range' as const
  constructor(public readonly value: number) {
    super(`LK ${value} out of range (1.0–25.0)`)
  }
}

export class MemberAlreadyDeactivatedError extends Error {
  readonly code = 'member.already-deactivated' as const
  constructor(public readonly memberId: MemberId) {
    super(`member ${memberId} is already deactivated`)
  }
}

export class MemberNotDeactivatedError extends Error {
  readonly code = 'member.not-deactivated' as const
  constructor(public readonly memberId: MemberId) {
    super(`member ${memberId} is not admin-deactivated`)
  }
}

export class MemberDeactivatedError extends Error {
  readonly code = 'member.deactivated' as const
  constructor(public readonly memberId: MemberId) {
    super(`member ${memberId} is deactivated`)
  }
}

export type InviteResult = {
  member: MemberAdminDto
  emailSent: boolean
  /** Nur gesetzt, wenn `emailSent === false` — Copy-Link-Fallback. */
  fallbackLink?: string
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
    rankingId: string
    seasonName: string
    ageGroupName: string
    mode: 'pyramid' | 'elo' | 'hybrid' | 'points-table'
    position: number
    entryCount: number
  }>

  matches: Array<
    | {
        kind: 'challenge'
        challengeId: string
        rankingName: string
        opponentId: MemberId
        opponentName: string
        result: 'win' | 'loss'
        sets: SetScore[]
        completedAt: Date
      }
    | {
        kind: 'friendly'
        friendlyId: string
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
