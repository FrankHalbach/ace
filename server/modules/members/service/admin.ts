import { auditService } from '../../admin'
import { memberRepo } from '../repository/member-repo'
import { MemberNotFoundError } from './profile'
import {
  CannotRemoveLastAdminError,
  MustKeepPlayerRoleError,
  type MemberAdminDto,
  type MemberId,
  type Role,
} from '../types'
import type { MemberRow } from '../../../db/schema/member'

function toAdminDto(row: MemberRow): MemberAdminDto {
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
    deactivatedAt: row.deactivatedAt,
    deactivationReason: row.deactivationReason,
    invitedAt: row.invitedAt,
    firstLoginAt: row.firstLoginAt,
  }
}

function uniqueRoles(roles: readonly Role[]): Role[] {
  return Array.from(new Set(roles))
}

function rolesEqual(a: readonly Role[], b: readonly Role[]): boolean {
  if (a.length !== b.length) return false
  const sa = new Set(a)
  for (const r of b) if (!sa.has(r)) return false
  return true
}

function countActiveAdmins(): number {
  return memberRepo
    .listAll()
    .filter((m) => m.roles.includes('admin') && m.deactivatedAt == null)
    .length
}

export {
  CannotRemoveLastAdminError,
  MustKeepPlayerRoleError,
}

export const memberAdminService = {
  /**
   * Vollstaendige Mitgliederliste fuer den Admin-Bereich — inkl. deaktivierter
   * Mitglieder. Sortiert alphabetisch nach Nachname.
   */
  listAll(): MemberAdminDto[] {
    return memberRepo
      .listAll()
      .map(toAdminDto)
      .sort((a, b) => {
        const ln = a.lastName.localeCompare(b.lastName, 'de')
        return ln !== 0 ? ln : a.firstName.localeCompare(b.firstName, 'de')
      })
  },

  /**
   * Setzt die Rollen eines Mitglieds. Audit-Eintrag nur bei tatsaechlicher
   * Aenderung. `player` muss erhalten bleiben. Mindestens ein aktiver Admin
   * muss uebrig bleiben — sonst Lock-out.
   */
  setRoles(
    memberId: MemberId,
    rolesInput: Role[],
    actorId: MemberId,
  ): MemberAdminDto {
    const member = memberRepo.findById(memberId)
    if (!member) throw new MemberNotFoundError(memberId)

    const roles = uniqueRoles(rolesInput)
    if (!roles.includes('player')) {
      throw new MustKeepPlayerRoleError()
    }

    // Lock-out-Schutz: wenn dieses Mitglied Admin war und es aktiv ist und
    // wir entziehen die Admin-Rolle, pruefen wir, ob ein weiterer aktiver
    // Admin uebrigbleibt.
    const wasAdmin = member.roles.includes('admin')
    const willBeAdmin = roles.includes('admin')
    const isActive = member.deactivatedAt == null
    if (wasAdmin && !willBeAdmin && isActive) {
      const remainingAdmins = countActiveAdmins() - 1
      if (remainingAdmins < 1) throw new CannotRemoveLastAdminError()
    }

    if (rolesEqual(member.roles, roles)) {
      return toAdminDto(member)
    }

    const updated = memberRepo.updateById(memberId, { roles })!
    auditService.log({
      actorId,
      action: 'member.role-changed',
      subjectKind: 'member',
      subjectId: memberId,
      before: { roles: member.roles },
      after: { roles: updated.roles },
    })
    return toAdminDto(updated)
  },
}
