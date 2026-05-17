import type { MemberId } from '../../members'
import { friendlyResultRepo } from '../repository/friendly-result-repo'
import {
  AlreadyConfirmedError,
  FriendlyInvalidTransitionError,
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
import {
  AcceptedFriendly,
  DisputedFriendly,
  PlayedFriendly,
  ReportedFriendly,
  type Actor,
} from '../../../../shared/domain/friendly'
import { applyFriendlyMutation, loadFriendlyMatch } from './match-adapter'

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
    outcome: row.outcome,
    outcomeNote: row.outcomeNote,
  }
}

/** Mappt Domain-Codes auf bestehende Service-Errors für API-Kompatibilität. */
function mapReportError(err: unknown): never {
  const code = err instanceof Error ? (err as { code?: string }).code : undefined
  if (code === 'friendly.before-scheduled') {
    throw new FriendlyInvalidTransitionError('CONFIRMED', 'PLAYED')
  }
  if (code === 'friendly.not-winner' || code === 'friendly.not-participant') {
    throw new NotWinnerError()
  }
  throw err instanceof Error ? err : new Error(String(err))
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
   * Ergebnis melden — Domain prüft Termin (#47), Sieger-Team, Reporter-Zugehörigkeit
   * und Set-Format. Setzt zugleich Friendly auf PLAYED (Status-Transition).
   */
  report(
    friendlyId: FriendlyId,
    reporterId: MemberId,
    input: ReportFriendlyResultInput,
    now: Date = new Date(),
  ): FriendlyResultDto {
    const match = loadFriendlyMatch(friendlyId)
    if (
      !(match instanceof AcceptedFriendly) &&
      !(match instanceof PlayedFriendly)
    ) {
      throw new FriendlyInvalidTransitionError(match._state as FriendlyId extends never ? never : 'CONFIRMED' | 'PLAYED' | 'PROPOSED', 'PLAYED')
    }

    const actor: Actor = { memberId: reporterId, isTrainer: false }
    try {
      applyFriendlyMutation(
        match.reportResult(
          actor,
          {
            winnerMemberIds: input.winnerMemberIds.map((id) => id as MemberId),
            sets: input.sets,
            outcome: input.outcome ?? 'regular',
            outcomeNote: input.outcomeNote,
          },
          now,
        ),
      )
    } catch (err) {
      mapReportError(err)
    }
    const row = friendlyResultRepo.findByFriendly(friendlyId)!
    return toDto(row)
  },

  /**
   * Verlierer-Team-Mitglied bestätigt. Domain prüft Loser-Zugehörigkeit.
   * Triggert Friendly → COMPLETED + last_friendly_at-Stempel.
   */
  confirm(
    id: FriendlyResultId,
    memberId: MemberId,
    now: Date = new Date(),
  ): FriendlyResultDto {
    const resultRow = friendlyResultRepo.findById(id)
    if (!resultRow) throw new FriendlyResultNotFoundError(id)
    if (resultRow.confirmationStatus === 'confirmed') throw new AlreadyConfirmedError()
    if (resultRow.confirmationStatus === 'disputed') throw new AlreadyConfirmedError()

    const match = loadFriendlyMatch(resultRow.friendlyId)
    if (!(match instanceof ReportedFriendly)) {
      throw new FriendlyInvalidTransitionError(match._state as 'PROPOSED', 'COMPLETED')
    }
    const actor: Actor = { memberId, isTrainer: false }
    try {
      applyFriendlyMutation(match.confirmResult(actor, now))
    } catch (err) {
      const code = err instanceof Error ? (err as { code?: string }).code : undefined
      if (code === 'friendly.not-loser') throw new NotLoserError()
      throw err
    }
    return toDto(friendlyResultRepo.findById(id)!)
  },

  dispute(
    id: FriendlyResultId,
    memberId: MemberId,
    input: DisputeFriendlyResultInput,
    now: Date = new Date(),
  ): FriendlyResultDto {
    const resultRow = friendlyResultRepo.findById(id)
    if (!resultRow) throw new FriendlyResultNotFoundError(id)
    if (resultRow.confirmationStatus !== 'pending') throw new AlreadyConfirmedError()

    const match = loadFriendlyMatch(resultRow.friendlyId)
    if (!(match instanceof ReportedFriendly)) {
      throw new FriendlyInvalidTransitionError(match._state as 'PROPOSED', 'DISPUTED')
    }
    const actor: Actor = { memberId, isTrainer: false }
    try {
      applyFriendlyMutation(match.disputeResult(actor, input.note, now))
    } catch (err) {
      const code = err instanceof Error ? (err as { code?: string }).code : undefined
      if (code === 'friendly.not-loser') throw new NotLoserError()
      throw err
    }
    return toDto(friendlyResultRepo.findById(id)!)
  },

  /**
   * Trainer-Force-Confirm: bestätigt das gemeldete Ergebnis ohne Loser-Check.
   * Greift sowohl bei pending als auch disputed Results.
   */
  forceConfirm(id: FriendlyResultId, now: Date = new Date()): FriendlyResultDto {
    const resultRow = friendlyResultRepo.findById(id)
    if (!resultRow) throw new FriendlyResultNotFoundError(id)
    if (resultRow.confirmationStatus === 'confirmed') throw new AlreadyConfirmedError()

    const match = loadFriendlyMatch(resultRow.friendlyId)
    if (!(match instanceof ReportedFriendly) && !(match instanceof DisputedFriendly)) {
      throw new FriendlyInvalidTransitionError(match._state as 'PROPOSED', 'COMPLETED')
    }
    const actor: Actor = { memberId: '' as MemberId, isTrainer: true }
    if (match instanceof DisputedFriendly) {
      applyFriendlyMutation(match.trainerForceConfirm(actor, now))
    } else {
      // ReportedFriendly: nutzt confirmResult mit Trainer-Override (vereinfacht
      // — Domain hat dafür keinen eigenen Befehl; wir verwenden den vorhandenen
      // Pfad und übergeben den Trainer als Confirmer.
      applyFriendlyMutation(match.confirmResult(actor, now))
    }
    return toDto(friendlyResultRepo.findById(id)!)
  },

  /** Cron: pending FriendlyResults nach 3 Tagen → disputed (FR-32). */
  autoDisputeStale(now: Date = new Date()): number {
    const cutoff = new Date(now.getTime() - PENDING_DISPUTE_AFTER_MS)
    const stale = friendlyResultRepo.findStalePending(cutoff)
    let updated = 0
    for (const r of stale) {
      try {
        const match = loadFriendlyMatch(r.friendlyId)
        if (match instanceof ReportedFriendly) {
          applyFriendlyMutation(
            match.disputeResult(
              { memberId: '' as MemberId, isTrainer: true },
              'Automatisch: keine Reaktion innerhalb von 3 Tagen',
              now,
            ),
          )
          updated++
        }
      } catch {
        // Friendly bereits in anderem Status — ignorieren
      }
    }
    return updated
  },
}
