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
  type FriendlyStatus,
} from '../types'
import type { FriendlyRow } from '../../../db/schema/friendly'
import type { FriendlyInviteeRow } from '../../../db/schema/friendly-invitee'
import {
  AcceptedFriendly,
  DisputedFriendly,
  PlayedFriendly,
  ProposedFriendly,
  type Actor,
} from '../../../../shared/domain/friendly'
import { applyFriendlyMutation, loadFriendlyMatch } from './match-adapter'

/** Helper für „Detail erneut frisch laden" nach Mutation. */
function reloadDetail(id: FriendlyId): FriendlyDetailDto {
  const row = friendlyRepo.findById(id)!
  const invitees = friendlyInviteeRepo.listByFriendly(id)
  return { ...toDto(row), invitees: invitees.map(toInviteeDto) }
}

const SCHEDULED_TOLERANCE_MS = 60 * 60 * 1000 // 1 Stunde Vergangenheit toleriert
const MAX_NEW_PER_DAY = 5
// Termin-Konflikt-Fenster: ±2 Stunden um den geplanten Slot. Ein Tennis-
// Match dauert 60–120 Minuten — wer in dem Fenster schon ein anderes Match
// hat, kann nicht zuverlässig spielen. Siehe Nachtrag N-04.
const SCHEDULE_CONFLICT_WINDOW_MS = 2 * 60 * 60 * 1000

const germanDateTime = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

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

function attachInvitees(rows: FriendlyRow[]): FriendlyDetailDto[] {
  if (rows.length === 0) return []
  const all = friendlyInviteeRepo.listByFriendlies(rows.map((r) => r.id))
  const byFriendly = new Map<FriendlyRow['id'], FriendlyInviteeRow[]>()
  for (const inv of all) {
    const bucket = byFriendly.get(inv.friendlyId)
    if (bucket) bucket.push(inv)
    else byFriendly.set(inv.friendlyId, [inv])
  }
  return rows.map((row) => ({
    ...toDto(row),
    invitees: (byFriendly.get(row.id) ?? []).map(toInviteeDto),
  }))
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
    return attachInvitees(friendlyRepo.listForMember(memberId))
  },

  listDisputed(): FriendlyDetailDto[] {
    return attachInvitees(friendlyRepo.listByStatus('DISPUTED'))
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

    // 7. Termin-Konflikt — weder Initiator noch Eingeladener darf zur Slot-
    //    Zeit (±2h) in einem anderen aktiven Friendly stehen. Siehe N-04.
    const slotStart = new Date(input.scheduledAt.getTime() - SCHEDULE_CONFLICT_WINDOW_MS)
    const slotEnd = new Date(input.scheduledAt.getTime() + SCHEDULE_CONFLICT_WINDOW_MS)
    const conflict = friendlyRepo.findConflictForMembers(
      [initiatorId, ...inviteeIds],
      slotStart,
      slotEnd,
    )
    if (conflict) {
      const who = profileService.findById(conflict.memberId)
      const name = who ? `${who.firstName} ${who.lastName}` : `Spieler ${conflict.memberId}`
      throw new FriendlyValidationError(
        'friendly.schedule-conflict',
        `${name} hat bereits ein Match am ${germanDateTime.format(conflict.scheduledAt)}.`,
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
    const match = loadFriendlyMatch(id)
    if (!(match instanceof ProposedFriendly)) {
      throw new FriendlyInvalidTransitionError(match._state as FriendlyStatus, 'CONFIRMED')
    }
    // Cross-Aggregate-Check: Schedule-Konflikt für den Akzeptierenden.
    // Bleibt in Service-Schicht, weil Domain nur _diesen_ Friendly kennt.
    const slotStart = new Date(match.scheduledAt.getTime() - SCHEDULE_CONFLICT_WINDOW_MS)
    const slotEnd = new Date(match.scheduledAt.getTime() + SCHEDULE_CONFLICT_WINDOW_MS)
    const conflict = friendlyRepo.findConflictForMembers([memberId], slotStart, slotEnd, id)
    if (conflict) {
      throw new FriendlyValidationError(
        'friendly.schedule-conflict',
        `Du hast bereits ein Match am ${germanDateTime.format(conflict.scheduledAt)}.`,
      )
    }
    const actor: Actor = { memberId, isTrainer: false }
    try {
      applyFriendlyMutation(match.accept(actor, now))
    } catch (err) {
      const code = err instanceof Error ? (err as { code?: string }).code : undefined
      if (code === 'friendly.not-invitee') throw new FriendlyNotParticipantError()
      if (code === 'friendly.already-responded') {
        throw new FriendlyInvalidTransitionError(match._state as FriendlyStatus, 'CONFIRMED')
      }
      throw err
    }
    return reloadDetail(id)
  },

  decline(id: FriendlyId, memberId: MemberId, now: Date = new Date()): FriendlyDetailDto {
    const match = loadFriendlyMatch(id)
    if (!(match instanceof ProposedFriendly)) {
      throw new FriendlyInvalidTransitionError(match._state as FriendlyStatus, 'DECLINED')
    }
    const actor: Actor = { memberId, isTrainer: false }
    try {
      applyFriendlyMutation(match.decline(actor, now))
    } catch (err) {
      const code = err instanceof Error ? (err as { code?: string }).code : undefined
      if (code === 'friendly.not-invitee') throw new FriendlyNotParticipantError()
      if (code === 'friendly.already-responded') {
        throw new FriendlyInvalidTransitionError(match._state as FriendlyStatus, 'DECLINED')
      }
      throw err
    }
    return reloadDetail(id)
  },

  // ───────────────────────────────────────────────────────────────────────
  // Cancel — Initiator zieht zurück (jeder Status außer COMPLETED/DISPUTED)
  // ───────────────────────────────────────────────────────────────────────

  cancel(id: FriendlyId, memberId: MemberId, now: Date = new Date()): FriendlyDetailDto {
    const match = loadFriendlyMatch(id)
    const actor: Actor = { memberId, isTrainer: false }
    // ReportedFriendly hat KEIN cancel() — das ist der #48-Fix am Type-Level.
    // PROPOSED/CONFIRMED/PLAYED dürfen, alles andere wirft InvalidTransition.
    if (
      match instanceof ProposedFriendly ||
      match instanceof AcceptedFriendly ||
      match instanceof PlayedFriendly
    ) {
      try {
        applyFriendlyMutation(match.cancel(actor, now))
      } catch (err) {
        if (err instanceof Error && (err as { code?: string }).code === 'friendly.not-initiator') {
          throw new FriendlyNotParticipantError()
        }
        throw err
      }
    } else {
      throw new FriendlyInvalidTransitionError(match._state as FriendlyStatus, 'CANCELLED')
    }
    return reloadDetail(id)
  },

  // ───────────────────────────────────────────────────────────────────────
  // Mark-played — Teilnehmer markiert als „gespielt, kein Ergebnis"
  // ───────────────────────────────────────────────────────────────────────

  markPlayed(id: FriendlyId, memberId: MemberId, now: Date = new Date()): FriendlyDetailDto {
    const match = loadFriendlyMatch(id)
    if (!(match instanceof AcceptedFriendly)) {
      throw new FriendlyInvalidTransitionError(match._state as FriendlyStatus, 'PLAYED')
    }
    const actor: Actor = { memberId, isTrainer: false }
    try {
      applyFriendlyMutation(match.markPlayed(actor, now))
    } catch (err) {
      const code = err instanceof Error ? (err as { code?: string }).code : undefined
      if (code === 'friendly.not-participant') throw new FriendlyNotParticipantError()
      throw err
    }
    return reloadDetail(id)
  },

  // ───────────────────────────────────────────────────────────────────────
  // Lifecycle-Übergänge zu COMPLETED/DISPUTED werden jetzt direkt aus
  // dem Domain (confirm-result/dispute-result-Mutation) gestaltet — keine
  // separaten markCompleted/markDisputed-Aufrufe mehr nötig.
  // ───────────────────────────────────────────────────────────────────────

  /** Trainer cancelt einen Streitfall — Friendly → CANCELLED, keine Rangliste-Wirkung. */
  cancelByTrainer(id: FriendlyId, now: Date = new Date()): FriendlyDto {
    const match = loadFriendlyMatch(id)
    if (!(match instanceof DisputedFriendly)) {
      throw new FriendlyInvalidTransitionError(match._state as FriendlyStatus, 'CANCELLED')
    }
    // Service ist hier der Trainer-Endpoint — Trainer-Flag explizit setzen.
    const actor: Actor = { memberId: '' as MemberId, isTrainer: true }
    applyFriendlyMutation(match.trainerCancel(actor, now))
    const updated = friendlyRepo.findById(id)!
    return toDto(updated)
  },
}

