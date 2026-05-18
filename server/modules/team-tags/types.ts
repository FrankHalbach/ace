import type { TeamTagId } from '../../db/schema/team-tag'
import type { MemberId } from '../members'

export type { TeamTagId }

export type TeamTagDto = {
  id: TeamTagId
  name: string
  sortOrder: number
  active: boolean
}

export type CreateTeamTagInput = {
  name: string
  sortOrder?: number
}

export type UpdateTeamTagInput = {
  name?: string
  sortOrder?: number
  active?: boolean
}

export type AssignTagsInput = {
  memberId: MemberId
  tagIds: TeamTagId[]
  assignedBy: MemberId
}
