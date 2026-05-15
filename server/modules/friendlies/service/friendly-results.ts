import type { MemberId } from '../../members'
import { friendliesService } from './friendlies'
import { friendlyInviteeRepo } from '../repository/friendly-invitee-repo'
import { friendlyRepo } from '../repository/friendly-repo'
import { friendlyResultRepo } from '../repository/friendly-result-repo'
import { validateSetsForMode, verifyWinnerConsistency } from './sets-validator'
import {
  AlreadyConfirmedError,
  FriendlyInvalidTransitionError,
  FriendlyNotFoundError,
  FriendlyResultNotFoundError,
  NotLoserError,
  NotWinnerError,
  type DisputeFriendlyResultInput,
  type FriendlyId,
  type FriendlyResultDto,
  type FriendlyResultId,
  type ReportFriendlyResultInput,
} from '../types'
import type { FriendlyResultRow } from '../../../db/schema/friendly-result'
import type { FriendlyRow } from '../../../db/schema/friendly'
import type { FriendlyInviteeRow } from '../../../db/schema/friendly-invitee'

const PENDING_DISPUTE_AFTER_MS = 3 * 24 * 60 * 60 * 1000 // 3 Tage (FR-32)

function toDto(row: FriendlyResultRow): FriendlyResultDto {
  return {
    id: row.id,
    friendlyId: row.friendlyId,
    winnerMemberIds: row.winnerMemberIds,
    sets: row.sets,
    matchMode: row.matchMode,
    reportedAt: row.reportedAt,
    reportedBy: row.reportedBy,
    confirmationStatus: row.confirmationStatus,
    confirmedAt: row.confirmedAt,
    confirmedBy: row.confirmedBy,
    disputedAt: row.disputedAt,
    disputeNote: row.disputeNote,
  }
}

/**
 * Liefert für ein Friendly: { initiatorTeam: MemberId[], opponentTeam: MemberId[] }
 */
function teams(row: FriendlyRow, invitees: FriendlyInviteeRow[]): {
  initiatorTeam: MemberId[]
  opponentTeam: MemberId[]
} {
  const initiatorTeam: MemberId[] = [row.initiatorId]
  const opponentTeam: MemberId[] = []
  for (const i of invitees) {
    if (i.team === 'initiator') initiatorTeam.push(i.memberId)
    else opponentTeam.push(i.memberId)
  }
  return { initiatorTeam, opponentTeam }
}

function arraysHaveSameMembers(a: MemberId[], b: MemberId[]): boolean {
  if (a.length !== b.length) return false
  const sa = new Set(a)
  return b.every((x) => sa.has(x))
}

export const friendlyResultsService = {
  findById(id: FriendlyResultId): FriendlyResultDto | undefined {
    const row = friendlyResultRepo.findById(id)
    return row ? toDto(row) : undefined
  },

  findForFriendly(friendlyId: FriendlyId): FriendlyResultDto | undefined {
    const row = friendlyResultRepo.findByFriendly(friendlyId)
    return row ? toDto(row) : undefined
  },

  /**
   * Ergebnis melden — Reporter muss Teilnehmer und Mitglied des Sieger-Teams sein.
   * Friendly muss `CONFIRMED` oder `PLAYED` sein.
   */
  report(
    friendlyId: FriendlyId,
    reporterId: MemberId,
    input: ReportFriendlyResultInput,
    now: Date = new Date(),
  ): FriendlyResultDto {
    const friendlyRow = friendlyRepo.findById(friendlyId)
    if (!friendlyRow) throw new FriendlyNotFoundError(friendlyId)
    if (friendlyRow.status !== 'CONFIRMED' && friendlyRow.status !== 'PLAYED') {
      throw new FriendlyInvalidTransitionError(friendlyRow.status, 'COMPLETED')
    }

    const invitees = friendlyInviteeRepo.listByFriendly(friendlyId)
    const { initiatorTeam, opponentTeam } = teams(friendlyRow, invitees)
    const allParticipants = [...initiatorTeam, ...opponentTeam]
    if (!allParticipants.includes(reporterId)) {
      throw new NotWinnerError() // ist auch kein Verlierer → strikteste Variante
    }

    const winnerIds = input.winnerMemberIds.map((n) => n as MemberId)
    const winnerCountExpected = friendlyRow.format === 'singles' ? 1 : 2
    if (winnerIds.length !== winnerCountExpected) {
      throw new NotWinnerError()
    }
    // Sieger-Team muss exakt einem der beiden Teams entsprechen
    const winnerIsInitiatorTeam = arraysHaveSameMembers(winnerIds, initiatorTeam)
    const winnerIsOpponentTeam = arraysHaveSameMembers(winnerIds, opponentTeam)
    if (!winnerIsInitiatorTeam && !winnerIsOpponentTeam) {
      throw new NotWinnerError()
    }
    // Reporter muss im Sieger-Team sein
    const winnerTeam = winnerIsInitiatorTeam ? initiatorTeam : opponentTeam
    if (!winnerTeam.includes(reporterId)) {
      throw new NotWinnerError()
    }

    validateSetsForMode(friendlyRow.matchMode, input.sets)
    // Konvention: Spielfeld-Seite A entspricht dem Initiator-Team.
    verifyWinnerConsistency(input.sets, winnerIsInitiatorTeam)

    if (friendlyResultRepo.findByFriendly(friendlyId)) {
      throw new AlreadyConfirmedError()
    }

    const row = friendlyResultRepo.insert({
      friendlyId,
      winnerMemberIds: winnerIds,
      sets: input.sets,
      matchMode: friendlyRow.matchMode,
      reportedAt: now,
      reportedBy: reporterId,
      confirmationStatus: 'pending',
    })
    return toDto(row)
  },

  /**
   * Verlierer-Team-Mitglied bestätigt. First-wins.
   * Markiert das Friendly als COMPLETED und stempelt `lastFriendlyAt` für alle.
   */
  confirm(
    id: FriendlyResultId,
    memberId: MemberId,
    now: Date = new Date(),
  ): FriendlyResultDto {
    const row = friendlyResultRepo.findById(id)
    if (!row) throw new FriendlyResultNotFoundError(id)
    if (row.confirmationStatus === 'confirmed') throw new AlreadyConfirmedError()
    if (row.confirmationStatus === 'disputed') throw new AlreadyConfirmedError()

    const friendlyRow = friendlyRepo.findById(row.friendlyId)
    if (!friendlyRow) throw new FriendlyResultNotFoundError(id)
    const invitees = friendlyInviteeRepo.listByFriendly(row.friendlyId)
    const { initiatorTeam, opponentTeam } = teams(friendlyRow, invitees)

    const winnerIsInitiatorTeam = arraysHaveSameMembers(row.winnerMemberIds, initiatorTeam)
    const loserTeam = winnerIsInitiatorTeam ? opponentTeam : initiatorTeam
    if (!loserTeam.includes(memberId)) throw new NotLoserError()

    friendlyResultRepo.updateById(id, {
      confirmationStatus: 'confirmed',
      confirmedAt: now,
      confirmedBy: memberId,
    })
    friendliesService.markCompleted(row.friendlyId, now)

    return toDto(friendlyResultRepo.findById(id)!)
  },

  dispute(
    id: FriendlyResultId,
    memberId: MemberId,
    input: DisputeFriendlyResultInput,
    now: Date = new Date(),
  ): FriendlyResultDto {
    const row = friendlyResultRepo.findById(id)
    if (!row) throw new FriendlyResultNotFoundError(id)
    if (row.confirmationStatus !== 'pending') throw new AlreadyConfirmedError()

    const friendlyRow = friendlyRepo.findById(row.friendlyId)
    if (!friendlyRow) throw new FriendlyResultNotFoundError(id)
    const invitees = friendlyInviteeRepo.listByFriendly(row.friendlyId)
    const { initiatorTeam, opponentTeam } = teams(friendlyRow, invitees)

    const winnerIsInitiatorTeam = arraysHaveSameMembers(row.winnerMemberIds, initiatorTeam)
    const loserTeam = winnerIsInitiatorTeam ? opponentTeam : initiatorTeam
    if (!loserTeam.includes(memberId)) throw new NotLoserError()

    friendlyResultRepo.updateById(id, {
      confirmationStatus: 'disputed',
      disputedAt: now,
      disputeNote: input.note,
    })
    friendliesService.markDisputed(row.friendlyId, now)

    return toDto(friendlyResultRepo.findById(id)!)
  },

  /** Cron: pending FriendlyResults nach 3 Tagen → disputed (FR-32). */
  autoDisputeStale(now: Date = new Date()): number {
    const cutoff = new Date(now.getTime() - PENDING_DISPUTE_AFTER_MS)
    const stale = friendlyResultRepo.findStalePending(cutoff)
    let updated = 0
    for (const r of stale) {
      friendlyResultRepo.updateById(r.id, {
        confirmationStatus: 'disputed',
        disputedAt: now,
        disputeNote: 'Automatisch: keine Reaktion innerhalb von 3 Tagen',
      })
      try {
        friendliesService.markDisputed(r.friendlyId, now)
      } catch {
        // Friendly bereits in anderem Status — ignorieren
      }
      updated++
    }
    return updated
  },
}
