import { profileService, type MemberId } from '../../members'
import { friendlyRepo } from '../repository/friendly-repo'
import { friendlyInviteeRepo } from '../repository/friendly-invitee-repo'
import {
  FriendlyInvalidTransitionError,
  FriendlyNotFoundError,
  FriendlyNotParticipantError,
  FriendlyValidationError,
  type CreateFriendlyInput,
  type FriendlyDetailDto,
  type FriendlyDto,
  type FriendlyId,
  type FriendlyInviteeDto,
  type FriendlyInviteeStatus,
  type FriendlyStatus,
} from '../types'
import type { FriendlyRow } from '../../../db/schema/friendly'
import type { FriendlyInviteeRow } from '../../../db/schema/friendly-invitee'

const SCHEDULED_TOLERANCE_MS = 60 * 60 * 1000 // 1 Stunde Vergangenheit toleriert
const MAX_NEW_PER_DAY = 5

function toDto(row: FriendlyRow): FriendlyDto {
  return {
    id: row.id,
    initiatorId: row.initiatorId,
    format: row.format,
    scheduledAt: row.scheduledAt,
    courtInfo: row.courtInfo,
    note: row.note,
    matchMode: row.matchMode,
    status: row.status,
    createdAt: row.createdAt,
    confirmedAt: row.confirmedAt,
    declinedAt: row.declinedAt,
    cancelledAt: row.cancelledAt,
    playedAt: row.playedAt,
    completedAt: row.completedAt,
    disputedAt: row.disputedAt,
  }
}

function toInviteeDto(row: FriendlyInviteeRow): FriendlyInviteeDto {
  return {
    id: row.id,
    friendlyId: row.friendlyId,
    memberId: row.memberId,
    team: row.team,
    status: row.status,
    respondedAt: row.respondedAt,
  }
}

function isParticipant(row: FriendlyRow, invitees: FriendlyInviteeRow[], memberId: MemberId): boolean {
  if (row.initiatorId === memberId) return true
  return invitees.some((i) => i.memberId === memberId)
}

/**
 * Liefert für ein Friendly **alle** Teilnehmer-IDs (Initiator + Eingeladene).
 * Das Initiator-Team enthält bei Doubles zusätzlich den Partner.
 */
function allParticipantIds(row: FriendlyRow, invitees: FriendlyInviteeRow[]): MemberId[] {
  return [row.initiatorId, ...invitees.map((i) => i.memberId)]
}

export const friendliesService = {
  // ───────────────────────────────────────────────────────────────────────
  // Lookup
  // ───────────────────────────────────────────────────────────────────────

  findById(id: FriendlyId): FriendlyDto | undefined {
    const row = friendlyRepo.findById(id)
    return row ? toDto(row) : undefined
  },

  getDetail(id: FriendlyId, memberId: MemberId): FriendlyDetailDto {
    const row = friendlyRepo.findById(id)
    if (!row) throw new FriendlyNotFoundError(id)
    const invitees = friendlyInviteeRepo.listByFriendly(id)
    if (!isParticipant(row, invitees, memberId)) {
      throw new FriendlyNotParticipantError()
    }
    return { ...toDto(row), invitees: invitees.map(toInviteeDto) }
  },

  listForMember(memberId: MemberId): FriendlyDetailDto[] {
    const rows = friendlyRepo.listForMember(memberId)
    return rows.map((row) => {
      const invitees = friendlyInviteeRepo.listByFriendly(row.id)
      return { ...toDto(row), invitees: invitees.map(toInviteeDto) }
    })
  },

  // ───────────────────────────────────────────────────────────────────────
  // Create
  // ───────────────────────────────────────────────────────────────────────

  create(
    initiatorId: MemberId,
    input: CreateFriendlyInput,
    now: Date = new Date(),
  ): FriendlyDetailDto {
    // 1. Selbst-Einladung
    const opponentIds = input.opponentIds.map((n) => n as MemberId)
    const partnerId = input.partnerId as MemberId | undefined
    const inviteeIds: MemberId[] = partnerId !== undefined ? [partnerId, ...opponentIds] : opponentIds

    if (inviteeIds.includes(initiatorId)) {
      throw new FriendlyValidationError(
        'friendly.same-member',
        'Du kannst dich nicht selbst einladen.',
      )
    }

    // 2. Doppelte Einladung
    const seen = new Set<MemberId>()
    for (const id of inviteeIds) {
      if (seen.has(id)) {
        throw new FriendlyValidationError(
          'friendly.duplicate-member',
          'Ein Spieler kommt mehrfach im Team vor.',
        )
      }
      seen.add(id)
    }

    // 3. Team-Shape (Zod sollte das schon halten, doppelt sicher ist gut)
    const expected = input.format === 'singles' ? 1 : 3
    if (inviteeIds.length !== expected) {
      throw new FriendlyValidationError(
        'friendly.invalid-team-shape',
        `Format ${input.format} braucht genau ${expected} Eingeladene.`,
      )
    }

    // 4. Termin nicht zu weit in der Vergangenheit
    if (input.scheduledAt.getTime() < now.getTime() - SCHEDULED_TOLERANCE_MS) {
      throw new FriendlyValidationError(
        'friendly.scheduled-in-past',
        'Termin liegt zu weit in der Vergangenheit.',
      )
    }

    // 5. Eingeladene existieren und sind nicht pausiert
    for (const id of inviteeIds) {
      const m = profileService.findById(id)
      if (!m) {
        throw new FriendlyValidationError(
          'friendly.not-participant',
          `Spieler ${id} existiert nicht.`,
        )
      }
      if (m.status === 'pausiert') {
        throw new FriendlyValidationError(
          'friendly.target-pausiert',
          `${m.firstName} ${m.lastName} ist pausiert.`,
        )
      }
    }

    // 6. Rate-Limit: max 5 neue Friendlies pro Initiator pro Tag
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayCount = friendlyRepo.countCreatedSince(initiatorId, todayStart)
    if (todayCount >= MAX_NEW_PER_DAY) {
      throw new FriendlyValidationError(
        'friendly.too-many-today',
        'Maximal 5 neue Freundschaftsspiele pro Tag.',
      )
    }

    // ─── Insert Friendly + Invitees in zwei Schritten ────────────────────
    const friendlyRow = friendlyRepo.insert({
      initiatorId,
      format: input.format,
      scheduledAt: input.scheduledAt,
      courtInfo: input.courtInfo ?? null,
      note: input.note ?? null,
      matchMode: input.matchMode,
      status: 'PROPOSED',
      createdAt: now,
    })

    const inviteeRows = friendlyInviteeRepo.insertMany(
      input.format === 'singles'
        ? opponentIds.map((id) => ({
            friendlyId: friendlyRow.id,
            memberId: id,
            team: 'opponent' as const,
            createdAt: now,
          }))
        : [
            {
              friendlyId: friendlyRow.id,
              memberId: partnerId!,
              team: 'initiator' as const,
              createdAt: now,
            },
            ...opponentIds.map((id) => ({
              friendlyId: friendlyRow.id,
              memberId: id,
              team: 'opponent' as const,
              createdAt: now,
            })),
          ],
    )

    return { ...toDto(friendlyRow), invitees: inviteeRows.map(toInviteeDto) }
  },

  // ───────────────────────────────────────────────────────────────────────
  // Accept / Decline
  // ───────────────────────────────────────────────────────────────────────

  accept(id: FriendlyId, memberId: MemberId, now: Date = new Date()): FriendlyDetailDto {
    return setInviteeStatusAndRecompute(id, memberId, 'accepted', now)
  },

  decline(id: FriendlyId, memberId: MemberId, now: Date = new Date()): FriendlyDetailDto {
    return setInviteeStatusAndRecompute(id, memberId, 'declined', now)
  },

  // ───────────────────────────────────────────────────────────────────────
  // Cancel — Initiator zieht zurück (jeder Status außer COMPLETED/DISPUTED)
  // ───────────────────────────────────────────────────────────────────────

  cancel(id: FriendlyId, memberId: MemberId, now: Date = new Date()): FriendlyDetailDto {
    const row = friendlyRepo.findById(id)
    if (!row) throw new FriendlyNotFoundError(id)
    if (row.initiatorId !== memberId) throw new FriendlyNotParticipantError()
    if (row.status === 'COMPLETED' || row.status === 'DISPUTED') {
      throw new FriendlyInvalidTransitionError(row.status, 'CANCELLED')
    }
    if (row.status === 'CANCELLED' || row.status === 'DECLINED') {
      throw new FriendlyInvalidTransitionError(row.status, 'CANCELLED')
    }
    const fromStates: FriendlyStatus[] = ['PROPOSED', 'CONFIRMED', 'PLAYED']
    const updated = friendlyRepo.transition(id, fromStates, 'CANCELLED', { cancelledAt: now })
    if (!updated) throw new FriendlyInvalidTransitionError(row.status, 'CANCELLED')
    const invitees = friendlyInviteeRepo.listByFriendly(id)
    return { ...toDto(updated), invitees: invitees.map(toInviteeDto) }
  },

  // ───────────────────────────────────────────────────────────────────────
  // Mark-played — Teilnehmer markiert als „gespielt, kein Ergebnis"
  // ───────────────────────────────────────────────────────────────────────

  markPlayed(id: FriendlyId, memberId: MemberId, now: Date = new Date()): FriendlyDetailDto {
    const row = friendlyRepo.findById(id)
    if (!row) throw new FriendlyNotFoundError(id)
    const invitees = friendlyInviteeRepo.listByFriendly(id)
    if (!isParticipant(row, invitees, memberId)) {
      throw new FriendlyNotParticipantError()
    }
    if (row.status !== 'CONFIRMED') {
      throw new FriendlyInvalidTransitionError(row.status, 'PLAYED')
    }
    const updated = friendlyRepo.transition(id, 'CONFIRMED', 'PLAYED', { playedAt: now })
    if (!updated) throw new FriendlyInvalidTransitionError(row.status, 'PLAYED')
    profileService.setLastFriendlyAt(allParticipantIds(updated, invitees), now)
    return { ...toDto(updated), invitees: invitees.map(toInviteeDto) }
  },

  // ───────────────────────────────────────────────────────────────────────
  // Lifecycle-Übergänge, von friendly-results-Service aufgerufen
  // ───────────────────────────────────────────────────────────────────────

  markCompleted(id: FriendlyId, now: Date = new Date()): FriendlyDto {
    const row = friendlyRepo.findById(id)
    if (!row) throw new FriendlyNotFoundError(id)
    const fromStates: FriendlyStatus[] = ['CONFIRMED', 'PLAYED']
    const updated = friendlyRepo.transition(id, fromStates, 'COMPLETED', { completedAt: now })
    if (!updated) throw new FriendlyInvalidTransitionError(row.status, 'COMPLETED')
    const invitees = friendlyInviteeRepo.listByFriendly(id)
    profileService.setLastFriendlyAt(allParticipantIds(updated, invitees), now)
    return toDto(updated)
  },

  markDisputed(id: FriendlyId, now: Date = new Date()): FriendlyDto {
    const row = friendlyRepo.findById(id)
    if (!row) throw new FriendlyNotFoundError(id)
    const fromStates: FriendlyStatus[] = ['CONFIRMED', 'PLAYED']
    const updated = friendlyRepo.transition(id, fromStates, 'DISPUTED', { disputedAt: now })
    if (!updated) throw new FriendlyInvalidTransitionError(row.status, 'DISPUTED')
    return toDto(updated)
  },
}

/**
 * Setzt den Invitee-Status und rechnet das Friendly-Status-Aggregat neu:
 *   - jemand declined  → Friendly DECLINED
 *   - alle accepted    → Friendly CONFIRMED
 *   - sonst            → bleibt PROPOSED
 */
function setInviteeStatusAndRecompute(
  id: FriendlyId,
  memberId: MemberId,
  desired: 'accepted' | 'declined',
  now: Date,
): FriendlyDetailDto {
  const row = friendlyRepo.findById(id)
  if (!row) throw new FriendlyNotFoundError(id)
  if (row.status !== 'PROPOSED') {
    throw new FriendlyInvalidTransitionError(row.status, 'CONFIRMED')
  }

  const invitee = friendlyInviteeRepo.findOne(id, memberId)
  if (!invitee) throw new FriendlyNotParticipantError()
  if (invitee.status !== 'pending') {
    throw new FriendlyInvalidTransitionError(row.status, 'CONFIRMED')
  }

  const newStatus: FriendlyInviteeStatus = desired
  friendlyInviteeRepo.setStatus(id, memberId, newStatus, now)

  const invitees = friendlyInviteeRepo.listByFriendly(id)

  let updatedFriendly = row
  if (desired === 'declined') {
    const t = friendlyRepo.transition(id, 'PROPOSED', 'DECLINED', { declinedAt: now })
    if (t) updatedFriendly = t
  } else if (invitees.every((i) => i.status === 'accepted')) {
    const t = friendlyRepo.transition(id, 'PROPOSED', 'CONFIRMED', { confirmedAt: now })
    if (t) updatedFriendly = t
  }

  return { ...toDto(updatedFriendly), invitees: invitees.map(toInviteeDto) }
}
