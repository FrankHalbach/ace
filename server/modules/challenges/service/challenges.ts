import { profileService, type MemberId } from '../../members'
import {
  getRankingEntries,
  getRankingMeta,
  strategyFor,
  type RankingId,
} from '../../rankings'
import { challengeRepo } from '../repository/challenge-repo'
import {
  ChallengeInvalidTransitionError,
  ChallengeNotParticipantError,
  ChallengeValidationError,
  type ChallengeDto,
  type ChallengeId,
  type ChallengeStatus,
  type CreateChallengeInput,
  type DeclineChallengeInput,
} from '../types'
import type { ChallengeRow } from '../../../db/schema/challenge'
import {
  AcceptedChallenge,
  DisputedChallenge,
  ProposedChallenge,
  type Actor,
} from '../../../../shared/domain/challenge'
import { applyChallengeMutation, loadChallenge } from './match-adapter'

const ACCEPT_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000 // 7 Tage (FR-24)
const PLAY_DEADLINE_MS = 21 * 24 * 60 * 60 * 1000 // 21 Tage (FR-25)
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000 // 14 Tage (FR-26)
const MAX_ACTIVE_PER_MEMBER = 2 // FR-27 / FR-111
const MAX_NEW_PER_DAY = 3 // FR-110

function toDto(row: ChallengeRow): ChallengeDto {
  return {
    id: row.id,
    challengerId: row.challengerId,
    challengedId: row.challengedId,
    rankingId: row.rankingId,
    status: row.status,
    createdAt: row.createdAt,
    acceptedAt: row.acceptedAt,
    declinedAt: row.declinedAt,
    expiredAt: row.expiredAt,
    completedAt: row.completedAt,
    disputedAt: row.disputedAt,
    cancelledAt: row.cancelledAt,
    declineReason: row.declineReason,
    declineNote: row.declineNote,
  }
}

/** Helper für „Detail erneut frisch laden" nach Mutation. */
function reloadDto(id: ChallengeId): ChallengeDto {
  return toDto(challengeRepo.findById(id)!)
}

export const challengesService = {
  // ───────────────────────────────────────────────────────────────────────
  // Lookup
  // ───────────────────────────────────────────────────────────────────────

  findById(id: ChallengeId): ChallengeDto | undefined {
    const row = challengeRepo.findById(id)
    return row ? toDto(row) : undefined
  },

  getForParticipant(id: ChallengeId, memberId: MemberId): ChallengeDto {
    const match = loadChallenge(id)
    const row = match.snap.row
    if (row.challengerId !== memberId && row.challengedId !== memberId) {
      throw new ChallengeNotParticipantError()
    }
    return toDto(row)
  },

  listForMember(memberId: MemberId): ChallengeDto[] {
    return challengeRepo.listForMember(memberId).map(toDto)
  },

  listDisputed(): ChallengeDto[] {
    return challengeRepo.listByStatus('DISPUTED').map(toDto)
  },

  // ───────────────────────────────────────────────────────────────────────
  // Create — mit allen Validation-Checks
  // ───────────────────────────────────────────────────────────────────────

  create(challengerId: MemberId, input: CreateChallengeInput, now: Date = new Date()): ChallengeDto {
    const challengedId = input.challengedId as MemberId
    const rankingId = input.rankingId as RankingId

    // 1. Selbst-Forderung
    if (challengerId === challengedId) {
      throw new ChallengeValidationError('challenge.same-member', 'Selbst-Forderung nicht erlaubt.')
    }

    // 2. Beide Spieler existieren
    const challenger = profileService.findById(challengerId)
    const challenged = profileService.findById(challengedId)
    if (!challenger || !challenged) {
      throw new ChallengeValidationError('challenge.not-in-ranking', 'Spieler nicht gefunden.')
    }

    // 3. Challenged darf nicht pausiert sein (FR-25c)
    if (challenged.status === 'pausiert') {
      throw new ChallengeValidationError(
        'challenge.target-pausiert',
        'Dieser Spieler ist pausiert.',
      )
    }

    // 4. Beide in der Rangliste? — über die RankingEntry-Snapshot
    const entries = getRankingEntries(rankingId)
    const challengerEntry = entries.find((e) => e.memberId === challengerId)
    const challengedEntry = entries.find((e) => e.memberId === challengedId)
    if (!challengerEntry || !challengedEntry) {
      throw new ChallengeValidationError(
        'challenge.not-in-ranking',
        'Beide Spieler müssen in dieser Rangliste stehen.',
      )
    }

    // 5. Rate-Limit FR-110: max 3 neue pro Tag
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayCount = challengeRepo.countCreatedSince(challengerId, todayStart)
    if (todayCount >= MAX_NEW_PER_DAY) {
      throw new ChallengeValidationError(
        'challenge.too-many-today',
        'Maximal 3 neue Challenges pro Tag.',
      )
    }

    // 6. Limit FR-27: max 2 aktive
    const activeChallenger = challengeRepo.countActiveByMember(challengerId)
    if (activeChallenger >= MAX_ACTIVE_PER_MEMBER) {
      throw new ChallengeValidationError(
        'challenge.too-many-active',
        'Du hast schon zu viele aktive Challenges.',
      )
    }

    // 7. Cooldown FR-26 / FR-20d — über alle Ranglisten
    const cooldownSince = new Date(now.getTime() - COOLDOWN_MS)
    if (challengeRepo.hasRecentInteraction(challengerId, challengedId, cooldownSince)) {
      throw new ChallengeValidationError(
        'challenge.cooldown-active',
        'Cooldown gegen denselben Gegner aktiv (14 Tage).',
      )
    }

    // 8. Strategy-Sprung-Regel
    const meta = getRankingMeta(rankingId)
    if (!meta) {
      throw new ChallengeValidationError('challenge.not-in-ranking', 'Rangliste nicht gefunden.')
    }
    // 8a. Saison muss aktiv sein — keine neuen Forderungen in PLANNED/CLOSED/ARCHIVED.
    if (meta.seasonStatus !== 'ACTIVE') {
      throw new ChallengeValidationError(
        'challenge.season-not-active',
        'Die Saison ist nicht aktiv — keine neuen Forderungen möglich.',
      )
    }
    const strategy = strategyFor(meta.mode)
    const validation = strategy.validateChallenge({
      challengerEntry,
      challengedEntry,
      config: meta.config,
    })
    if (!validation.ok) {
      throw new ChallengeValidationError(
        validation.code ?? 'challenge.jump-not-allowed',
        validation.reason,
      )
    }

    // Alles gut → einlegen
    const row = challengeRepo.insert({
      challengerId,
      challengedId,
      rankingId,
      status: 'PROPOSED',
      createdAt: now,
    })
    return toDto(row)
  },

  // ───────────────────────────────────────────────────────────────────────
  // Accept / Decline (Lifecycle via Domain-Modell)
  // ───────────────────────────────────────────────────────────────────────

  accept(id: ChallengeId, memberId: MemberId, now: Date = new Date()): ChallengeDto {
    const match = loadChallenge(id)
    if (!(match instanceof ProposedChallenge)) {
      throw new ChallengeInvalidTransitionError(match._state as ChallengeStatus, 'ACCEPTED')
    }
    const actor: Actor = { memberId, isTrainer: false }
    try {
      applyChallengeMutation(match.accept(actor, now))
    } catch (err) {
      if (err instanceof Error && (err as { code?: string }).code === 'challenge.not-participant') {
        throw new ChallengeNotParticipantError()
      }
      throw err
    }
    return reloadDto(id)
  },

  decline(
    id: ChallengeId,
    memberId: MemberId,
    input: DeclineChallengeInput,
    now: Date = new Date(),
  ): ChallengeDto {
    const match = loadChallenge(id)
    if (!(match instanceof ProposedChallenge)) {
      throw new ChallengeInvalidTransitionError(match._state as ChallengeStatus, 'DECLINED')
    }
    const actor: Actor = { memberId, isTrainer: false }
    try {
      applyChallengeMutation(
        match.decline(actor, { reason: input.reason, note: input.note ?? null }, now),
      )
    } catch (err) {
      if (err instanceof Error && (err as { code?: string }).code === 'challenge.not-participant') {
        throw new ChallengeNotParticipantError()
      }
      throw err
    }
    return reloadDto(id)
  },

  // ───────────────────────────────────────────────────────────────────────
  // Lifecycle-Übergänge, vom results-Modul aufgerufen
  // ───────────────────────────────────────────────────────────────────────

  markCompleted(id: ChallengeId, now: Date = new Date()): ChallengeDto {
    const match = loadChallenge(id)
    if (match instanceof AcceptedChallenge) {
      applyChallengeMutation(match.markCompleted(now))
    } else if (match instanceof DisputedChallenge) {
      // Trainer-Force-Confirm-Pfad — Domain verlangt isTrainer.
      const trainerActor: Actor = { memberId: '' as MemberId, isTrainer: true }
      applyChallengeMutation(match.markCompleted(trainerActor, now))
    } else {
      throw new ChallengeInvalidTransitionError(match._state as ChallengeStatus, 'COMPLETED')
    }
    return reloadDto(id)
  },

  markDisputed(id: ChallengeId, now: Date = new Date()): ChallengeDto {
    const match = loadChallenge(id)
    if (!(match instanceof AcceptedChallenge)) {
      throw new ChallengeInvalidTransitionError(match._state as ChallengeStatus, 'DISPUTED')
    }
    applyChallengeMutation(match.markDisputed(now))
    return reloadDto(id)
  },

  /** Trainer cancelt einen Streitfall — Challenge → CANCELLED, keine Rangliste-Wirkung. */
  cancelByTrainer(id: ChallengeId, now: Date = new Date()): ChallengeDto {
    const match = loadChallenge(id)
    if (!(match instanceof DisputedChallenge)) {
      throw new ChallengeInvalidTransitionError(match._state as ChallengeStatus, 'CANCELLED')
    }
    const trainerActor: Actor = { memberId: '' as MemberId, isTrainer: true }
    applyChallengeMutation(match.trainerCancel(trainerActor, now))
    return reloadDto(id)
  },

  // ───────────────────────────────────────────────────────────────────────
  // Cron-Helpers
  // ───────────────────────────────────────────────────────────────────────

  expireStaleProposed(now: Date = new Date()): number {
    const olderThan = new Date(now.getTime() - ACCEPT_DEADLINE_MS)
    const stale = challengeRepo.findStaleByStatus('PROPOSED', olderThan)
    let expired = 0
    for (const c of stale) {
      const match = loadChallenge(c.id)
      if (!(match instanceof ProposedChallenge)) continue
      applyChallengeMutation(match.expire(now))
      expired++
    }
    return expired
  },

  /** ACCEPTED ohne Ergebnis nach 21 Tagen → DISPUTED, Trainer entscheidet */
  disputeStaleAccepted(now: Date = new Date()): number {
    const olderThan = new Date(now.getTime() - PLAY_DEADLINE_MS)
    const stale = challengeRepo.findStaleByStatus('ACCEPTED', olderThan)
    let updated = 0
    for (const c of stale) {
      const match = loadChallenge(c.id)
      if (!(match instanceof AcceptedChallenge)) continue
      applyChallengeMutation(match.markStaleDisputed(now))
      updated++
    }
    return updated
  },
}
