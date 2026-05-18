import { teamTagRepo } from '../repository/team-tag-repo'
import type {
  AssignTagsInput,
  CreateTeamTagInput,
  TeamTagDto,
  TeamTagId,
  UpdateTeamTagInput,
} from '../types'
import type { TeamTagRow } from '../../../db/schema/team-tag'
import type { MemberId } from '../../members'

function toDto(row: TeamTagRow): TeamTagDto {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    active: row.active,
  }
}

export class TeamTagNotFoundError extends Error {
  readonly code = 'team-tag.not-found' as const
  constructor(public readonly id: TeamTagId) {
    super(`team tag ${id} not found`)
  }
}

export const teamTagsService = {
  listAll(): TeamTagDto[] {
    return teamTagRepo.listAll().map(toDto)
  },

  listForMember(memberId: MemberId): TeamTagDto[] {
    return teamTagRepo.listForMember(memberId).map(toDto)
  },

  create(_input: CreateTeamTagInput): TeamTagDto {
    throw new Error('not implemented — folgt mit Endpoint-PR')
  },

  update(_id: TeamTagId, _patch: UpdateTeamTagInput): TeamTagDto {
    throw new Error('not implemented — folgt mit Endpoint-PR')
  },

  delete(_id: TeamTagId): void {
    throw new Error('not implemented — folgt mit Endpoint-PR')
  },

  setAssignments(_input: AssignTagsInput): TeamTagDto[] {
    throw new Error('not implemented — folgt mit Endpoint-PR')
  },
}
