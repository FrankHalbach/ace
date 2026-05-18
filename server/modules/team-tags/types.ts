import { z } from 'zod'
import type { MemberId } from '../members'
import type { TeamTagId } from '../../db/schema/team-tag'

export type { TeamTagId }

export type TeamTagDto = {
  id: TeamTagId
  name: string
  sortOrder: number
  active: boolean
}

/** Schlanker Spieler-DTO für die Mannschafts-Mitgliederliste. */
export type TeamMemberDto = {
  id: MemberId
  firstName: string
  lastName: string
  gender: 'm' | 'w'
  dtbLk: number
  status: 'aktiv' | 'pausiert'
}

// --- Zod-Schemas (auch für Front-End geteilt) -----------------------------

export const createTeamTagInput = z.object({
  name: z.string().trim().min(1, 'name darf nicht leer sein').max(80),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export const updateTeamTagInput = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'mindestens ein Feld muss gesetzt sein',
  })

export const setMemberTeamTagsInput = z.object({
  tagIds: z.array(z.string().min(1)).max(50),
})

export type CreateTeamTagInput = z.infer<typeof createTeamTagInput>
export type UpdateTeamTagInput = z.infer<typeof updateTeamTagInput>
export type SetMemberTeamTagsInput = z.infer<typeof setMemberTeamTagsInput>

export type AssignTagsInput = {
  memberId: MemberId
  tagIds: TeamTagId[]
  assignedBy: MemberId
}

// --- Domain-Fehler --------------------------------------------------------

export class TeamTagNotFoundError extends Error {
  readonly code = 'team-tag.not-found' as const
  constructor(public readonly id: TeamTagId) {
    super(`team tag ${id} not found`)
  }
}

export class TeamTagDuplicateNameError extends Error {
  readonly code = 'team-tag.duplicate-name' as const
  constructor(public readonly name: string) {
    super(`team tag name already in use: ${name}`)
  }
}

export class TeamTagInactiveError extends Error {
  readonly code = 'team-tag.inactive' as const
  constructor(public readonly id: TeamTagId) {
    super(`team tag ${id} is archived and cannot be assigned`)
  }
}
