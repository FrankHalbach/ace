import { auditService } from '../../admin'
import { memberRepo } from '../repository/member-repo'
import { MemberNotFoundError } from './profile'
import {
  CannotRemoveLastAdminError,
  LkOutOfRangeError,
  MemberAlreadyDeactivatedError,
  MemberDuplicateEmailError,
  MemberNotDeactivatedError,
  MustKeepPlayerRoleError,
  type CreateMemberInput,
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
  LkOutOfRangeError,
  MemberAlreadyDeactivatedError,
  MemberDuplicateEmailError,
  MemberNotDeactivatedError,
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
   * Legt ein einzelnes Mitglied manuell an (FR-60 Single-Variante).
   * Pflichtrolle `player`, kein Magic-Link-Token, kein Email-Versand —
   * Einladung passiert separat im naechsten Schritt.
   */
  create(input: CreateMemberInput, actorId: MemberId): MemberAdminDto {
    // Zod hat email bereits lowercased; repo prueft case-insensitive.
    if (memberRepo.findByEmail(input.email)) {
      throw new MemberDuplicateEmailError(input.email)
    }
    const row = memberRepo.insert({
      email: input.email,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      birthYear: input.birthYear,
      gender: input.gender,
      dtbLk: input.dtbLk,
      roles: ['player'],
    })
    auditService.log({
      actorId,
      action: 'member.created',
      subjectKind: 'member',
      subjectId: row.id,
      after: {
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        birthYear: row.birthYear,
        gender: row.gender,
        dtbLk: row.dtbLk,
      },
    })
    return toAdminDto(row)
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

  /**
   * Korrigiert die DTB-LK eines Mitglieds (FR-63, Spec §4.1).
   * Admin und Trainer duerfen. Wenn `note` gesetzt ist, landet sie im
   * Audit-Eintrag als Begruendung. Identische LK ist ein No-op, kein
   * Audit-Eintrag.
   */
  setLk(
    memberId: MemberId,
    dtbLk: number,
    actorId: MemberId,
    note?: string,
  ): MemberAdminDto {
    if (!Number.isFinite(dtbLk) || dtbLk < 1 || dtbLk > 25) {
      throw new LkOutOfRangeError(dtbLk)
    }
    const member = memberRepo.findById(memberId)
    if (!member) throw new MemberNotFoundError(memberId)

    if (member.dtbLk === dtbLk) {
      return toAdminDto(member)
    }

    const updated = memberRepo.updateById(memberId, { dtbLk })!
    auditService.log({
      actorId,
      action: 'member.lk-corrected',
      subjectKind: 'member',
      subjectId: memberId,
      before: { dtbLk: member.dtbLk },
      after: { dtbLk: updated.dtbLk },
      note,
    })
    return toAdminDto(updated)
  },

  /**
   * Admin-Deaktivierung (Soft-Delete, FR-60b). Setzt `status='pausiert'`
   * plus `deactivatedAt` als Marker, der Admin-Deaktivierung von einer
   * Selbst-Pausierung unterscheidet. Wenn der zu Deaktivierende der
   * letzte aktive Admin ist, wird die Aktion blockiert (Lock-out-Schutz).
   */
  deactivate(
    memberId: MemberId,
    reason: string | undefined,
    actorId: MemberId,
    now: Date = new Date(),
  ): MemberAdminDto {
    const member = memberRepo.findById(memberId)
    if (!member) throw new MemberNotFoundError(memberId)
    if (member.deactivatedAt != null) {
      throw new MemberAlreadyDeactivatedError(memberId)
    }

    // Lock-out-Schutz: wenn dieses Mitglied ein aktiver Admin ist, muss
    // mindestens ein weiterer aktiver Admin uebrig bleiben.
    if (member.roles.includes('admin')) {
      const remaining = countActiveAdmins() - 1
      if (remaining < 1) throw new CannotRemoveLastAdminError()
    }

    const updated = memberRepo.updateById(memberId, {
      status: 'pausiert',
      deactivatedAt: now,
      deactivationReason: reason ?? null,
    })!
    auditService.log({
      actorId,
      action: 'member.deactivated',
      subjectKind: 'member',
      subjectId: memberId,
      before: {
        status: member.status,
        deactivatedAt: member.deactivatedAt,
        deactivationReason: member.deactivationReason,
      },
      after: {
        status: updated.status,
        deactivatedAt: updated.deactivatedAt,
        deactivationReason: updated.deactivationReason,
      },
    })
    return toAdminDto(updated)
  },

  /**
   * Hebt eine Admin-Deaktivierung auf. Setzt `status='aktiv'` und nullt
   * `deactivatedAt` + `deactivationReason`. Wirft, wenn das Mitglied
   * nicht admin-deaktiviert war (Self-Pause wird ueber das Profil
   * aufgehoben, nicht hier).
   */
  reactivate(memberId: MemberId, actorId: MemberId): MemberAdminDto {
    const member = memberRepo.findById(memberId)
    if (!member) throw new MemberNotFoundError(memberId)
    if (member.deactivatedAt == null) {
      throw new MemberNotDeactivatedError(memberId)
    }

    const updated = memberRepo.updateById(memberId, {
      status: 'aktiv',
      deactivatedAt: null,
      deactivationReason: null,
    })!
    auditService.log({
      actorId,
      action: 'member.reactivated',
      subjectKind: 'member',
      subjectId: memberId,
      before: {
        status: member.status,
        deactivatedAt: member.deactivatedAt,
        deactivationReason: member.deactivationReason,
      },
      after: {
        status: updated.status,
        deactivatedAt: updated.deactivatedAt,
        deactivationReason: updated.deactivationReason,
      },
    })
    return toAdminDto(updated)
  },
}
