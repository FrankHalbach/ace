import { memberRepo } from '../repository/member-repo'
import type {
  MemberDto,
  MemberId,
  Role,
  SessionView,
  UpdateOwnProfileInput,
} from '../types'
import type { MemberRow } from '../../../db/schema/member'

export type { Role, SessionView }

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

  /**
   * Aktivitäts-Stempel beim Friendly-Lifecycle (PLAYED / COMPLETED).
   * Akzeptiert mehrere IDs in einem Aufruf, weil ein Friendly bis zu vier
   * Teilnehmer hat.
   */
  setLastFriendlyAt(memberIds: MemberId[], at: Date): void {
    for (const id of memberIds) {
      memberRepo.updateById(id, { lastFriendlyAt: at })
    }
  },

  /**
   * Setzt `firstLoginAt` beim allerersten Magic-Link-Konsum (Admin-Design-Doc).
   * Idempotent: spätere Aufrufe lassen den ursprünglichen Stempel stehen.
   */
  markFirstLoginIfMissing(id: MemberId, at: Date = new Date()): void {
    const row = memberRepo.findById(id)
    if (!row) return
    if (row.firstLoginAt != null) return
    memberRepo.updateById(id, { firstLoginAt: at })
  },

  /**
   * Kompakter Read-Path für die Session-Refresh-Middleware (#90). Liefert
   * Rollen plus den Admin-Deaktivierungs-Marker; Self-Pause ist davon
   * abgegrenzt — pausierte Mitglieder dürfen sich weiter einloggen.
   */
  loadSessionView(id: MemberId): SessionView | undefined {
    const row = memberRepo.findById(id)
    if (!row) return undefined
    return {
      id: row.id,
      roles: row.roles,
      adminDeactivated: row.deactivatedAt != null,
    }
  },
}
