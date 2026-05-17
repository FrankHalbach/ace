import { z } from 'zod'
import type { AgeGroupGender, AgeGroupId } from '../../db/schema/age-group'
import type { SeasonConfig, SeasonId, SeasonStatus } from '../../db/schema/season'

export type { AgeGroupGender, AgeGroupId, SeasonId, SeasonStatus, SeasonConfig }

// -- Zod-Schemas ---------------------------------------------------------------

export const createSeasonInput = z.object({
  name: z.string().min(3).max(80),
})

export const updateSeasonInput = z
  .object({
    name: z.string().min(3).max(80),
    config: z.record(z.string(), z.unknown()),
  })
  .partial()
  .strict()

const ageRange = z.number().int().min(0).max(120).nullable()

export const createAgeGroupInput = z
  .object({
    name: z.string().min(1).max(40),
    minAge: ageRange,
    maxAge: ageRange,
    gender: z.enum(['m', 'w', 'mixed']),
    active: z.boolean().default(true),
  })
  .refine(
    (v) => v.minAge === null || v.maxAge === null || v.minAge <= v.maxAge,
    { message: 'minAge muss ≤ maxAge sein', path: ['minAge'] },
  )

export const updateAgeGroupInput = z
  .object({
    name: z.string().min(1).max(40),
    minAge: ageRange,
    maxAge: ageRange,
    gender: z.enum(['m', 'w', 'mixed']),
    active: z.boolean(),
  })
  .partial()
  .strict()
  .refine(
    (v) =>
      v.minAge === undefined ||
      v.maxAge === undefined ||
      v.minAge === null ||
      v.maxAge === null ||
      v.minAge <= v.maxAge,
    { message: 'minAge muss ≤ maxAge sein', path: ['minAge'] },
  )

export type CreateSeasonInput = z.infer<typeof createSeasonInput>
export type UpdateSeasonInput = z.infer<typeof updateSeasonInput>
export type CreateAgeGroupInput = z.infer<typeof createAgeGroupInput>
export type UpdateAgeGroupInput = z.infer<typeof updateAgeGroupInput>

// -- Public DTOs ---------------------------------------------------------------

export type AgeGroupDto = {
  id: AgeGroupId
  seasonId: SeasonId
  name: string
  minAge: number | null
  maxAge: number | null
  gender: AgeGroupGender
  active: boolean
}

export type SeasonDto = {
  id: SeasonId
  name: string
  status: SeasonStatus
  startedAt: Date | null
  closedAt: Date | null
  archivedAt: Date | null
  config: SeasonConfig
  createdAt: Date
  updatedAt: Date
}

export type SeasonDetailDto = SeasonDto & {
  ageGroups: AgeGroupDto[]
}

// -- Errors --------------------------------------------------------------------

export class SeasonNotFoundError extends Error {
  readonly code = 'season.not-found' as const
  constructor(public readonly id: SeasonId) {
    super(`season ${id} not found`)
  }
}

export class SeasonNameTakenError extends Error {
  readonly code = 'season.name-taken' as const
  constructor(public override readonly name: string) {
    super(`season name "${name}" already exists`)
  }
}

export class SeasonInvalidTransitionError extends Error {
  readonly code = 'season.invalid-transition' as const
  constructor(public readonly from: SeasonStatus, public readonly to: SeasonStatus) {
    super(`cannot transition season from ${from} to ${to}`)
  }
}

export class SeasonFrozenError extends Error {
  readonly code = 'season.frozen' as const
  constructor(public readonly id: SeasonId, public readonly status: SeasonStatus) {
    super(`season ${id} is ${status} — edits only allowed in PLANNED`)
  }
}

export class AgeGroupNotFoundError extends Error {
  readonly code = 'age-group.not-found' as const
  constructor(public readonly id: AgeGroupId) {
    super(`age group ${id} not found`)
  }
}

export class AgeGroupNameTakenError extends Error {
  readonly code = 'age-group.name-taken' as const
  constructor(public readonly seasonId: SeasonId, public override readonly name: string) {
    super(`age group "${name}" already exists in season ${seasonId}`)
  }
}
