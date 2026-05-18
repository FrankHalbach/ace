import { challengesService, type ChallengeId } from '../../challenges'
import type { MemberId } from '../../members'
import {
  applyMutations,
  getRankingEntries,
  getRankingMeta,
  strategyFor,
} from '../../rankings'
import { matchResultRepo } from '../repository/match-result-repo'
import { validateSetsForMode, verifyWinnerConsistency } from '../../../../shared/match-scoring'
import {
  AlreadyConfirmedError,
  ChallengeNotAcceptedError,
  MatchResultNotFoundError,
  NotLoserError,
  NotWinnerOrLoserError,
  type DisputeResultInput,
  type MatchMode,
  type MatchResultDto,
  type MatchResultId,
  type ReportResultInput,
} from '../types'
import type { MatchResultRow } from '../../../db/schema/match-result'

const PENDING_DISPUTE_AFTER_MS = 3 * 24 * 60 * 60 * 1000 // 3 Tage (FR-32)

const DEFAULT_MATCH_MODE: MatchMode = 'two-sets-match-tiebreak'

function toDto(row: MatchResultRow): MatchResultDto {
  return {
    id: row.id,
    challengeId: row.challengeId,
    winnerId: row.winnerId,
    sets: row.sets,
    matchMode: row.matchMode,
    reportedAt: row.reportedAt,
    reportedBy: row.reportedBy,
    confirmationStatus: row.confirmationStatus,
    confirmedAt: row.confirmedAt,
    disputedAt: row.disputedAt,
    disputeNote: row.disputeNote,
    outcome: row.outcome,
    outcomeNote: row.outcomeNote,
    applied: row.applied,
    appliedAt: row.appliedAt,
  }
}

export const resultsService = {
  findById(id: MatchResultId): MatchResultDto | undefined {
    const row = matchResultRepo.findById(id)
    return row ? toDto(row) : undefined
  },

  findForChallenge(challengeId: ChallengeId): MatchResultDto | undefined {
    const row = matchResultRepo.findByChallenge(challengeId)
    return row ? toDto(row) : undefined
  },

  /**
   * Ergebnis melden — nur Sieger oder Verlierer (= Teilnehmer der Challenge).
   * Challenge muss im Status ACCEPTED sein.
   */
  report(
    challengeId: ChallengeId,
    reporterId: MemberId,
    input: ReportResultInput,
    now: Date = new Date(),
  ): MatchResultDto {
    const challenge = challengesService.findById(challengeId)
    if (!challenge) throw new ChallengeNotAcceptedError() // 404-ähnlich
    if (challenge.status !== 'ACCEPTED') throw new ChallengeNotAcceptedError()

    if (reporterId !== challenge.challengerId && reporterId !== challenge.challengedId) {
      throw new NotWinnerOrLoserError()
    }
    const winnerId = input.winnerId as MemberId
    if (winnerId !== challenge.challengerId && winnerId !== challenge.challengedId) {
      throw new NotWinnerOrLoserError()
    }

    // Modus aus Input oder Default
    const matchMode: MatchMode = input.matchMode ?? DEFAULT_MATCH_MODE
    const outcome = input.outcome ?? 'regular'
    validateSetsForMode(matchMode, input.sets, { outcome })
    if (outcome === 'regular') {
      verifyWinnerConsistency(input.sets, winnerId === challenge.challengerId)
    }
    // walkover/retirement: Sieger ist explizit gemeldet (Anwesenheits-Sieg
    // bzw. der Nicht-Aufgebende). Keine Score-Konsistenz-Prüfung.

    const existing = matchResultRepo.findByChallenge(challengeId)
    if (existing) {
      // Doppelte Meldung — verboten in v1
      throw new AlreadyConfirmedError()
    }

    const row = matchResultRepo.insert({
      challengeId,
      winnerId,
      sets: input.sets,
      matchMode,
      reportedAt: now,
      reportedBy: reporterId,
      confirmationStatus: 'pending',
      outcome,
      outcomeNote: input.outcomeNote ?? null,
    })
    return toDto(row)
  },

  /**
   * Verlierer bestätigt das Ergebnis.
   * Triggert:
   *   - Strategy.applyResult → Mutationen auf die Rangliste
   *   - Challenge.status = COMPLETED
   *   - MatchResult.applied = true
   * Alles in einer Drizzle-Transaktion.
   */
  confirm(id: MatchResultId, memberId: MemberId, now: Date = new Date()): MatchResultDto {
    const row = matchResultRepo.findById(id)
    if (!row) throw new MatchResultNotFoundError(id)

    const challenge = challengesService.findById(row.challengeId)
    if (!challenge) throw new MatchResultNotFoundError(id)

    if (row.confirmationStatus === 'confirmed') throw new AlreadyConfirmedError()
    if (row.confirmationStatus === 'disputed') {
      throw new AlreadyConfirmedError() // disputed → kein einfaches confirm mehr
    }

    // Nur Verlierer darf bestätigen
    const loserId =
      row.winnerId === challenge.challengerId ? challenge.challengedId : challenge.challengerId
    if (memberId !== loserId) throw new NotLoserError()

    // Strategy-Mutationen erzeugen
    const entries = getRankingEntries(challenge.rankingId)
    const challengerEntry = entries.find((e) => e.memberId === challenge.challengerId)!
    const challengedEntry = entries.find((e) => e.memberId === challenge.challengedId)!

    const meta = getRankingMeta(challenge.rankingId)!
    const strategy = strategyFor(meta.mode)
    const mutations = strategy.applyResult({
      winnerId: row.winnerId,
      loserId,
      challengerEntry,
      challengedEntry,
      allEntries: entries,
      config: meta.config,
      now,
      outcome: row.outcome,
    })

    // Mutationen anwenden + MatchResult + Challenge updaten
    applyMutations(mutations, id)
    matchResultRepo.updateById(id, {
      confirmationStatus: 'confirmed',
      confirmedAt: now,
      applied: true,
      appliedAt: now,
    })
    challengesService.markCompleted(challenge.id, now)

    const updated = matchResultRepo.findById(id)!
    return toDto(updated)
  },

  dispute(
    id: MatchResultId,
    memberId: MemberId,
    input: DisputeResultInput,
    now: Date = new Date(),
  ): MatchResultDto {
    const row = matchResultRepo.findById(id)
    if (!row) throw new MatchResultNotFoundError(id)

    const challenge = challengesService.findById(row.challengeId)
    if (!challenge) throw new MatchResultNotFoundError(id)

    if (row.confirmationStatus !== 'pending') throw new AlreadyConfirmedError()

    const loserId =
      row.winnerId === challenge.challengerId ? challenge.challengedId : challenge.challengerId
    if (memberId !== loserId) throw new NotLoserError()

    matchResultRepo.updateById(id, {
      confirmationStatus: 'disputed',
      disputedAt: now,
      disputeNote: input.note,
    })
    challengesService.markDisputed(challenge.id, now)

    return toDto(matchResultRepo.findById(id)!)
  },

  /**
   * Trainer-Force-Confirm: bestätigt das gemeldete Ergebnis ohne Loser-Check
   * und ohne dass es im pending-Status sein muss. Funktioniert auch auf
   * disputed Ergebnissen — wendet die Mutation an, falls noch nicht applied.
   */
  forceConfirm(id: MatchResultId, now: Date = new Date()): MatchResultDto {
    const row = matchResultRepo.findById(id)
    if (!row) throw new MatchResultNotFoundError(id)
    if (row.applied) throw new AlreadyConfirmedError()

    const challenge = challengesService.findById(row.challengeId)
    if (!challenge) throw new MatchResultNotFoundError(id)

    const loserId =
      row.winnerId === challenge.challengerId ? challenge.challengedId : challenge.challengerId

    const entries = getRankingEntries(challenge.rankingId)
    const challengerEntry = entries.find((e) => e.memberId === challenge.challengerId)!
    const challengedEntry = entries.find((e) => e.memberId === challenge.challengedId)!

    const meta = getRankingMeta(challenge.rankingId)!
    const strategy = strategyFor(meta.mode)
    const mutations = strategy.applyResult({
      winnerId: row.winnerId,
      loserId,
      challengerEntry,
      challengedEntry,
      allEntries: entries,
      config: meta.config,
      now,
      outcome: row.outcome,
    })

    applyMutations(mutations, id)
    matchResultRepo.updateById(id, {
      confirmationStatus: 'confirmed',
      confirmedAt: now,
      applied: true,
      appliedAt: now,
    })
    challengesService.markCompleted(challenge.id, now)

    return toDto(matchResultRepo.findById(id)!)
  },

  /** Cron: pending → disputed nach 3 Tagen (FR-32) */
  autoDisputeStale(now: Date = new Date()): number {
    const cutoff = new Date(now.getTime() - PENDING_DISPUTE_AFTER_MS)
    const stale = matchResultRepo.findStalePending(cutoff)
    let updated = 0
    for (const r of stale) {
      matchResultRepo.updateById(r.id, {
        confirmationStatus: 'disputed',
        disputedAt: now,
        disputeNote: 'Automatisch: keine Reaktion innerhalb von 3 Tagen',
      })
      try {
        challengesService.markDisputed(r.challengeId, now)
      } catch {
        // Challenge ist evtl. schon in einem anderen Status — ignorieren
      }
      updated++
    }
    return updated
  },
}
