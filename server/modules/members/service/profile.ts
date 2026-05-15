import { memberRepo } from '../repository/member-repo'
import type { MemberDto, MemberId, UpdateOwnProfileInput } from '../types'
import type { MemberRow } from '../../../db/schema/member'

function toDto(row: MemberRow): MemberDto {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    birthYear: row.birthYear,
    gender: row.gender,
    dtbLk: row.dtbLk,
    status: row.status,
    roles: row.roles,
    preferences: row.preferences,
  }
}

export class MemberNotFoundError extends Error {
  readonly code = 'member.not-found' as const
  constructor(public readonly id: MemberId) {
    super(`member ${id} not found`)
  }
}

export const profileService = {
  listAll(): MemberDto[] {
    return memberRepo.listAll().map(toDto)
  },

  findByEmail(email: string): MemberDto | undefined {
    const row = memberRepo.findByEmail(email)
    return row ? toDto(row) : undefined
  },

  findById(id: MemberId): MemberDto | undefined {
    const row = memberRepo.findById(id)
    return row ? toDto(row) : undefined
  },

  getOwnProfile(id: MemberId): MemberDto {
    const row = memberRepo.findById(id)
    if (!row) throw new MemberNotFoundError(id)
    return toDto(row)
  },

  updateOwnProfile(id: MemberId, input: UpdateOwnProfileInput): MemberDto {
    const updated = memberRepo.updateById(id, input)
    if (!updated) throw new MemberNotFoundError(id)
    return toDto(updated)
  },
}
