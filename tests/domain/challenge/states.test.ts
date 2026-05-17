/**
 * Unit-Tests für die Challenge-State-Klassen.
 *
 * Reine Domain-Tests — keine DB, kein Service, kein Drizzle.
 */
import { describe, expect, it } from 'vitest'
import {
  AcceptedChallenge,
  CancelledChallenge,
  CompletedChallenge,
  DeclinedChallenge,
  DisputedChallenge,
  ExpiredChallenge,
  ProposedChallenge,
  challengeFromRow,
  type Actor,
} from '../../../shared/domain/challenge'
import type { ChallengeId, ChallengeRow } from '../../../server/db/schema/challenge'
import type { MemberId } from '../../../server/db/schema/member'
import type { RankingId } from '../../../server/db/schema/ranking'

const CHALLENGER = 'challenger-id' as MemberId
const CHALLENGED = 'challenged-id' as MemberId
const NOW = new Date('2026-05-10T12:00:00Z')

function row(overrides: Partial<ChallengeRow> = {}): ChallengeRow {
  return {
    id: 'c1' as ChallengeId,
    challengerId: CHALLENGER,
    challengedId: CHALLENGED,
    rankingId: 'r1' as RankingId,
    status: 'PROPOSED',
    createdAt: new Date('2026-05-01T10:00:00Z'),
    acceptedAt: null,
    declinedAt: null,
    expiredAt: null,
    completedAt: null,
    disputedAt: null,
    cancelledAt: null,
    declineReason: null,
    declineNote: null,
    ...overrides,
  }
}

const challengedActor: Actor = { memberId: CHALLENGED, isTrainer: false }
const challengerActor: Actor = { memberId: CHALLENGER, isTrainer: false }
const trainerActor: Actor = { memberId: 'trainer-id' as MemberId, isTrainer: true }
const strangerActor: Actor = { memberId: 'stranger-id' as MemberId, isTrainer: false }

// ─── Factory ────────────────────────────────────────────────────────────────

describe('challengeFromRow', () => {
  it('PROPOSED → ProposedChallenge', () => {
    expect(challengeFromRow(row({ status: 'PROPOSED' }))).toBeInstanceOf(ProposedChallenge)
  })
  it('ACCEPTED → AcceptedChallenge', () => {
    expect(challengeFromRow(row({ status: 'ACCEPTED' }))).toBeInstanceOf(AcceptedChallenge)
  })
  it('DISPUTED → DisputedChallenge', () => {
    expect(challengeFromRow(row({ status: 'DISPUTED' }))).toBeInstanceOf(DisputedChallenge)
  })
  it('COMPLETED → CompletedChallenge', () => {
    expect(challengeFromRow(row({ status: 'COMPLETED' }))).toBeInstanceOf(CompletedChallenge)
  })
  it('CANCELLED → CancelledChallenge', () => {
    expect(challengeFromRow(row({ status: 'CANCELLED' }))).toBeInstanceOf(CancelledChallenge)
  })
  it('DECLINED → DeclinedChallenge', () => {
    expect(challengeFromRow(row({ status: 'DECLINED' }))).toBeInstanceOf(DeclinedChallenge)
  })
  it('EXPIRED → ExpiredChallenge', () => {
    expect(challengeFromRow(row({ status: 'EXPIRED' }))).toBeInstanceOf(ExpiredChallenge)
  })
})

// ─── ProposedChallenge ──────────────────────────────────────────────────────

describe('ProposedChallenge', () => {
  const proposed = () => new ProposedChallenge({ row: row() })

  it('Challenged kann accepten', () => {
    const mut = proposed().accept(challengedActor, NOW)
    expect(mut.kind).toBe('accept-challenge')
  })

  it('Challenger kann NICHT accepten', () => {
    expect(() => proposed().accept(challengerActor, NOW)).toThrow(/participant|challenged/i)
  })

  it('Fremder kann NICHT accepten', () => {
    expect(() => proposed().accept(strangerActor, NOW)).toThrow(/participant|challenged/i)
  })

  it('Challenged kann declinen — Reason wandert in Mutation', () => {
    const mut = proposed().decline(
      challengedActor,
      { reason: 'injury', note: 'Knie' },
      NOW,
    )
    expect(mut.kind).toBe('decline-challenge')
    expect(mut.reason).toBe('injury')
    expect(mut.note).toBe('Knie')
  })

  it('Challenger kann NICHT declinen', () => {
    expect(() =>
      proposed().decline(challengerActor, { reason: 'work', note: null }, NOW),
    ).toThrow(/participant|challenged/i)
  })

  it('expire ist erlaubt (Cron-Pfad)', () => {
    const mut = proposed().expire(NOW)
    expect(mut.kind).toBe('expire-challenge')
  })

  it('hat keine markCompleted-Methode', () => {
    expect('markCompleted' in proposed()).toBe(false)
  })

  it('hat keine trainerCancel-Methode', () => {
    expect('trainerCancel' in proposed()).toBe(false)
  })

  it('canAccept reflektiert Berechtigung', () => {
    expect(proposed().canAccept(challengedActor)).toBe(true)
    expect(proposed().canAccept(challengerActor)).toBe(false)
  })
})

// ─── AcceptedChallenge ──────────────────────────────────────────────────────

describe('AcceptedChallenge', () => {
  const accepted = () => new AcceptedChallenge({ row: row({ status: 'ACCEPTED' }) })

  it('markCompleted → mark-completed-Mutation', () => {
    const mut = accepted().markCompleted(NOW)
    expect(mut.kind).toBe('mark-completed')
  })

  it('markDisputed → mark-disputed-Mutation', () => {
    const mut = accepted().markDisputed(NOW)
    expect(mut.kind).toBe('mark-disputed')
  })

  it('markStaleDisputed → mark-disputed-Mutation (Cron-Pfad)', () => {
    const mut = accepted().markStaleDisputed(NOW)
    expect(mut.kind).toBe('mark-disputed')
  })

  it('hat keine accept-Methode (schon akzeptiert)', () => {
    expect('accept' in accepted()).toBe(false)
  })

  it('hat keine decline-Methode (schon akzeptiert)', () => {
    expect('decline' in accepted()).toBe(false)
  })

  it('hat keine trainerCancel-Methode (nur aus DISPUTED)', () => {
    expect('trainerCancel' in accepted()).toBe(false)
  })
})

// ─── DisputedChallenge ──────────────────────────────────────────────────────

describe('DisputedChallenge', () => {
  const disputed = () => new DisputedChallenge({ row: row({ status: 'DISPUTED' }) })

  it('Trainer kann force-completen', () => {
    const mut = disputed().markCompleted(trainerActor, NOW)
    expect(mut.kind).toBe('mark-completed')
  })

  it('Nicht-Trainer kann NICHT force-completen', () => {
    expect(() => disputed().markCompleted(challengerActor, NOW)).toThrow(/trainer/i)
  })

  it('Trainer kann cancellen', () => {
    const mut = disputed().trainerCancel(trainerActor, NOW)
    expect(mut.kind).toBe('trainer-cancel')
  })

  it('Nicht-Trainer kann NICHT cancellen', () => {
    expect(() => disputed().trainerCancel(challengerActor, NOW)).toThrow(/trainer/i)
  })

  it('hat keine accept-/decline-/markDisputed-Methode', () => {
    const d = disputed()
    expect('accept' in d).toBe(false)
    expect('decline' in d).toBe(false)
    expect('markDisputed' in d).toBe(false)
  })
})

// ─── Terminal States ────────────────────────────────────────────────────────

describe('Terminal States', () => {
  it('CompletedChallenge hat keine Aktionen', () => {
    const m = new CompletedChallenge({ row: row({ status: 'COMPLETED' }) })
    expect('accept' in m).toBe(false)
    expect('markCompleted' in m).toBe(false)
    expect('trainerCancel' in m).toBe(false)
  })

  it('CancelledChallenge hat keine Aktionen', () => {
    const m = new CancelledChallenge({ row: row({ status: 'CANCELLED' }) })
    expect('accept' in m).toBe(false)
    expect('trainerCancel' in m).toBe(false)
  })

  it('DeclinedChallenge hat keine Aktionen', () => {
    const m = new DeclinedChallenge({ row: row({ status: 'DECLINED' }) })
    expect('accept' in m).toBe(false)
    expect('decline' in m).toBe(false)
  })

  it('ExpiredChallenge hat keine Aktionen', () => {
    const m = new ExpiredChallenge({ row: row({ status: 'EXPIRED' }) })
    expect('accept' in m).toBe(false)
    expect('expire' in m).toBe(false)
  })
})
