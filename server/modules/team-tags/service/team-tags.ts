import { auditService } from '../../admin'
import { teamTagRepo } from '../repository/team-tag-repo'
import {
  TeamTagDuplicateNameError,
  TeamTagInactiveError,
  TeamTagNotFoundError,
  type AssignTagsInput,
  type CreateTeamTagInput,
  type TeamTagDto,
  type TeamTagId,
  type UpdateTeamTagInput,
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

function loadTag(id: TeamTagId): TeamTagRow {
  const row = teamTagRepo.findById(id)
  if (!row) throw new TeamTagNotFoundError(id)
  return row
}

export {
  TeamTagDuplicateNameError,
  TeamTagInactiveError,
  TeamTagNotFoundError,
}

export const teamTagsService = {
  listAll(): TeamTagDto[] {
    return teamTagRepo.listAll().map(toDto)
  },

  listForMember(memberId: MemberId): TeamTagDto[] {
    return teamTagRepo.listForMember(memberId).map(toDto)
  },

  create(input: CreateTeamTagInput, actorId: MemberId): TeamTagDto {
    const name = input.name.trim()
    if (teamTagRepo.findByNameLower(name)) {
      throw new TeamTagDuplicateNameError(name)
    }
    const row = teamTagRepo.insert({
      name,
      sortOrder: input.sortOrder ?? 0,
    })
    auditService.log({
      actorId,
      action: 'team-tag.created',
      subjectKind: 'team-tag',
      subjectId: row.id,
      after: { name: row.name, sortOrder: row.sortOrder, active: row.active },
    })
    return toDto(row)
  },

  update(
    id: TeamTagId,
    patch: UpdateTeamTagInput,
    actorId: MemberId,
  ): TeamTagDto {
    const before = loadTag(id)

    if (patch.name && patch.name.trim() !== before.name) {
      const existing = teamTagRepo.findByNameLower(patch.name)
      if (existing && existing.id !== id) {
        throw new TeamTagDuplicateNameError(patch.name)
      }
    }

    const updated = teamTagRepo.updateById(id, {
      name: patch.name?.trim(),
      sortOrder: patch.sortOrder,
      active: patch.active,
    })!

    if (patch.name && patch.name.trim() !== before.name) {
      auditService.log({
        actorId,
        action: 'team-tag.renamed',
        subjectKind: 'team-tag',
        subjectId: id,
        before: { name: before.name },
        after: { name: updated.name },
      })
    }

    return toDto(updated)
  },

  delete(id: TeamTagId, actorId: MemberId): void {
    const before = loadTag(id)
    teamTagRepo.deleteById(id)
    auditService.log({
      actorId,
      action: 'team-tag.deleted',
      subjectKind: 'team-tag',
      subjectId: id,
      before: {
        name: before.name,
        sortOrder: before.sortOrder,
        active: before.active,
      },
    })
  },

  setAssignments(input: AssignTagsInput): TeamTagDto[] {
    const desiredIds = Array.from(new Set(input.tagIds))

    for (const tagId of desiredIds) {
      const tag = teamTagRepo.findById(tagId)
      if (!tag) throw new TeamTagNotFoundError(tagId)
      if (!tag.active) {
        const before = teamTagRepo
          .listAssignments(input.memberId)
          .some((a) => a.teamTagId === tagId)
        if (!before) throw new TeamTagInactiveError(tagId)
      }
    }

    const beforeRows = teamTagRepo.listForMember(input.memberId)
    const beforeIds = beforeRows.map((r) => r.id)

    teamTagRepo.deleteAssignmentsForMember(input.memberId)
    teamTagRepo.insertAssignments(
      desiredIds.map((tagId) => ({
        memberId: input.memberId,
        teamTagId: tagId,
        assignedBy: input.assignedBy,
      })),
    )

    const afterRows = teamTagRepo.listForMember(input.memberId)

    const beforeSet = new Set(beforeIds)
    const afterSet = new Set(afterRows.map((r) => r.id))
    const changed =
      beforeSet.size !== afterSet.size ||
      [...beforeSet].some((id) => !afterSet.has(id))

    if (changed) {
      auditService.log({
        actorId: input.assignedBy,
        action: 'member.team-tags-changed',
        subjectKind: 'member',
        subjectId: input.memberId,
        before: { tagIds: beforeIds },
        after: { tagIds: afterRows.map((r) => r.id) },
      })
    }

    return afterRows.map(toDto)
  },
}
