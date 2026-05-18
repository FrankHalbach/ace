/**
 * Unit-Tests für die Friendly-State-Klassen.
 *
 * Tests sind reine Domain-Tests — keine DB, kein Service, kein Drizzle.
 * Wir bauen `FriendlyRow`/`FriendlyInviteeRow`/`FriendlyResultRow` als Fixture
 * und prüfen, dass jede State-Klasse nur die Aktionen erlaubt, die wir im
 * Design-Doc beschrieben haben.
 */
import { describe, expect, it } from 'vitest'
import {
  AcceptedFriendly,
  CompletedFriendly,
  CancelledFriendly,
  DeclinedFriendly,
  DisputedFriendly,
  PlayedFriendly,
  ProposedFriendly,
  ReportedFriendly,
  friendlyFromRows,
  type Actor,
} from '../../../shared/domain/friendly'
import type { FriendlyId, FriendlyRow } from '../../../server/db/schema/friendly'
import type {
  FriendlyInviteeId,
  FriendlyInviteeRow,
} from '../../../server/db/schema/friendly-invitee'
import type {
  FriendlyResultId,
  FriendlyResultRow,
} from '../../../server/db/schema/friendly-result'
import type { MemberId } from '../../../server/db/schema/member'

const INITIATOR = 'init-id' as MemberId
const OPPONENT = 'opp-id' as MemberId
const PARTNER = 'partner-id' as MemberId
const SECOND_OPPONENT = 'opp2-id' as MemberId
const SCHEDULED = new Date('2026-05-01T18:00:00Z')
const AFTER_MATCH = new Date('2026-05-01T20:30:00Z')
const BEFORE_MATCH = new Date('2026-05-01T10:00:00Z')

function row(overrides: Partial<FriendlyRow> = {}): FriendlyRow {
  return {
    id: 'f1' as FriendlyId,
    initiatorId: INITIATOR,
    format: 'singles',
    scheduledAt: SCHEDULED,
    courtInfo: null,
    note: null,
    matchMode: 'two-sets-match-tiebreak',
    status: 'PROPOSED',
    createdAt: new Date('2026-04-25T10:00:00Z'),
    confirmedAt: null,
    declinedAt: null,
    cancelledAt: null,
    playedAt: null,
    completedAt: null,
    disputedAt: null,
    ...overrides,
  }
}

function invitee(overrides: Partial<FriendlyInviteeRow> = {}): FriendlyInviteeRow {
  return {
    id: 1 as FriendlyInviteeId,
    friendlyId: 'f1' as FriendlyId,
    memberId: OPPONENT,
    team: 'opponent',
    status: 'pending',
    respondedAt: null,
    createdAt: new Date(),
    ...overrides,
  }
}

function result(overrides: Partial<FriendlyResultRow> = {}): FriendlyResultRow {
  return {
    id: 100 as FriendlyResultId,
    friendlyId: 'f1' as FriendlyId,
    winnerMemberIds: [INITIATOR],
    sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
    matchMode: 'two-sets-match-tiebreak',
    reportedAt: AFTER_MATCH,
    reportedBy: INITIATOR,
    confirmationStatus: 'pending',
    confirmedAt: null,
    confirmedBy: null,
    disputedAt: null,
    disputeNote: null,
    outcome: 'regular',
    outcomeNote: null,
    ...overrides,
  }
}

const opponentActor: Actor = { memberId: OPPONENT, isTrainer: false }
const initiatorActor: Actor = { memberId: INITIATOR, isTrainer: false }
const trainerActor: Actor = { memberId: 'trainer-id' as MemberId, isTrainer: true }
const strangerActor: Actor = { memberId: 'stranger-id' as MemberId, isTrainer: false }

// ─── Factory ─────────────────────────────────────────────────────────────────

describe('friendlyFromRows', () => {
  it('PROPOSED ohne Result → ProposedFriendly', () => {
    const m = friendlyFromRows(row({ status: 'PROPOSED' }), [invitee()], null)
    expect(m).toBeInstanceOf(ProposedFriendly)
  })

  it('CONFIRMED ohne Result → AcceptedFriendly', () => {
    const m = friendlyFromRows(row({ status: 'CONFIRMED' }), [invitee({ status: 'accepted' })], null)
    expect(m).toBeInstanceOf(AcceptedFriendly)
  })

  it('CONFIRMED MIT pending Result → ReportedFriendly (Status holds pending result)', () => {
    const m = friendlyFromRows(
      row({ status: 'CONFIRMED' }),
      [invitee({ status: 'accepted' })],
      result(),
    )
    expect(m).toBeInstanceOf(ReportedFriendly)
  })

  it('PLAYED ohne Result → PlayedFriendly', () => {
    const m = friendlyFromRows(row({ status: 'PLAYED' }), [invitee({ status: 'accepted' })], null)
    expect(m).toBeInstanceOf(PlayedFriendly)
  })

  it('PLAYED mit pending Result → ReportedFriendly', () => {
    const m = friendlyFromRows(row({ status: 'PLAYED' }), [invitee({ status: 'accepted' })], result())
    expect(m).toBeInstanceOf(ReportedFriendly)
  })

  it('DISPUTED → DisputedFriendly', () => {
    const m = friendlyFromRows(row({ status: 'DISPUTED' }), [invitee({ status: 'accepted' })], result({ confirmationStatus: 'disputed' }))
    expect(m).toBeInstanceOf(DisputedFriendly)
  })

  it('COMPLETED → CompletedFriendly', () => {
    const m = friendlyFromRows(row({ status: 'COMPLETED' }), [invitee({ status: 'accepted' })], result({ confirmationStatus: 'confirmed' }))
    expect(m).toBeInstanceOf(CompletedFriendly)
  })

  it('CANCELLED → CancelledFriendly', () => {
    const m = friendlyFromRows(row({ status: 'CANCELLED' }), [invitee()], null)
    expect(m).toBeInstanceOf(CancelledFriendly)
  })

  it('DECLINED → DeclinedFriendly', () => {
    const m = friendlyFromRows(row({ status: 'DECLINED' }), [invitee({ status: 'declined' })], null)
    expect(m).toBeInstanceOf(DeclinedFriendly)
  })
})

// ─── ProposedFriendly ────────────────────────────────────────────────────────

describe('ProposedFriendly', () => {
  it('Invitee kann accepten → AcceptInviteeMutation; bei nur einem Invitee auch alsoConfirm', () => {
    const m = new ProposedFriendly({ row: row(), invitees: [invitee()] })
    const mut = m.accept(opponentActor, AFTER_MATCH)
    expect(mut.kind).toBe('accept-invitee')
    expect(mut.alsoConfirmFriendly).toBe(true)
  })

  it('Doubles: erster Accept lässt Friendly noch PROPOSED', () => {
    const m = new ProposedFriendly({
      row: row({ format: 'doubles' }),
      invitees: [
        invitee({ id: 1 as FriendlyInviteeId, memberId: PARTNER, team: 'initiator' }),
        invitee({ id: 2 as FriendlyInviteeId, memberId: OPPONENT, team: 'opponent' }),
        invitee({ id: 3 as FriendlyInviteeId, memberId: SECOND_OPPONENT, team: 'opponent' }),
      ],
    })
    const mut = m.accept(opponentActor, AFTER_MATCH)
    expect(mut.alsoConfirmFriendly).toBe(false)
  })

  it('Nicht-Invitee kann nicht accepten', () => {
    const m = new ProposedFriendly({ row: row(), invitees: [invitee()] })
    expect(() => m.accept(strangerActor, AFTER_MATCH)).toThrow(/invitee/i)
  })

  it('Bereits-akzeptiert kann nicht nochmal accepten', () => {
    const m = new ProposedFriendly({ row: row(), invitees: [invitee({ status: 'accepted' })] })
    expect(() => m.accept(opponentActor, AFTER_MATCH)).toThrow(/already/i)
  })

  it('Initiator kann cancellen', () => {
    const m = new ProposedFriendly({ row: row(), invitees: [invitee()] })
    expect(() => m.cancel(initiatorActor, AFTER_MATCH)).not.toThrow()
  })

  it('Invitee kann NICHT cancellen (kein Trainer)', () => {
    const m = new ProposedFriendly({ row: row(), invitees: [invitee()] })
    expect(() => m.cancel(opponentActor, AFTER_MATCH)).toThrow(/initiator/i)
  })

  it('Trainer kann jederzeit cancellen', () => {
    const m = new ProposedFriendly({ row: row(), invitees: [invitee()] })
    expect(() => m.cancel(trainerActor, AFTER_MATCH)).not.toThrow()
  })

  it('hat keine reportResult-Methode', () => {
    const m = new ProposedFriendly({ row: row(), invitees: [invitee()] })
    expect('reportResult' in m).toBe(false)
  })
})

// ─── AcceptedFriendly — Bug #47 ──────────────────────────────────────────────

describe('AcceptedFriendly — #47 (Result vor Termin)', () => {
  const accepted = () =>
    new AcceptedFriendly({
      row: row({ status: 'CONFIRMED' }),
      invitees: [invitee({ status: 'accepted' })],
    })

  it('reportResult vor scheduledAt wirft BeforeScheduledError', () => {
    expect(() =>
      accepted().reportResult(
        initiatorActor,
        { winnerMemberIds: [INITIATOR], sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }] },
        BEFORE_MATCH,
      ),
    ).toThrow(/scheduled/i)
  })

  it('reportResult nach scheduledAt funktioniert', () => {
    const mut = accepted().reportResult(
      initiatorActor,
      { winnerMemberIds: [INITIATOR], sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }] },
      AFTER_MATCH,
    )
    expect(mut.kind).toBe('report-result')
    expect(mut.insert.winnerMemberIds).toEqual([INITIATOR])
  })

  it('canReportResult false vor Termin, true danach', () => {
    expect(accepted().canReportResult(initiatorActor, BEFORE_MATCH)).toBe(false)
    expect(accepted().canReportResult(initiatorActor, AFTER_MATCH)).toBe(true)
  })

  it('cancel ist erlaubt (kein Result da)', () => {
    expect(() => accepted().cancel(initiatorActor, AFTER_MATCH)).not.toThrow()
  })

  it('markPlayed erlaubt jedem Teilnehmer', () => {
    expect(() => accepted().markPlayed(opponentActor, AFTER_MATCH)).not.toThrow()
  })

  it('markPlayed verweigert Nicht-Teilnehmer', () => {
    expect(() => accepted().markPlayed(strangerActor, AFTER_MATCH)).toThrow(/participant/i)
  })
})

// ─── ReportedFriendly — Bug #48 ──────────────────────────────────────────────

describe('ReportedFriendly — #48 (Cancel nach Result)', () => {
  const reported = () =>
    new ReportedFriendly({
      row: row({ status: 'CONFIRMED' }),
      invitees: [invitee({ status: 'accepted' })],
      result: result(),
    })

  it('hat KEINE cancel()-Methode (Compile-Time + Runtime)', () => {
    const r = reported()
    expect('cancel' in r).toBe(false)
  })

  it('Verlierer-Team kann confirmen', () => {
    // Initiator hat gewonnen (default in result()), also ist Opponent der Loser
    const mut = reported().confirmResult(opponentActor, AFTER_MATCH)
    expect(mut.kind).toBe('confirm-result')
  })

  it('Sieger-Team-Mitglied darf NICHT confirmen', () => {
    expect(() => reported().confirmResult(initiatorActor, AFTER_MATCH)).toThrow(/losing/i)
  })

  it('Trainer darf jederzeit confirmen (Loser-Check übersprungen)', () => {
    expect(() => reported().confirmResult(trainerActor, AFTER_MATCH)).not.toThrow()
  })

  it('Verlierer-Team kann disputen', () => {
    const mut = reported().disputeResult(opponentActor, 'Score war anders', AFTER_MATCH)
    expect(mut.kind).toBe('dispute-result')
  })

  it('Trainer/Cron kann disputen (auto-dispute-Pfad)', () => {
    expect(() =>
      reported().disputeResult(trainerActor, 'Automatisch', AFTER_MATCH),
    ).not.toThrow()
  })
})

// ─── PlayedFriendly ──────────────────────────────────────────────────────────

describe('PlayedFriendly', () => {
  const played = () =>
    new PlayedFriendly({
      row: row({ status: 'PLAYED' }),
      invitees: [invitee({ status: 'accepted' })],
    })

  it('reportResult funktioniert ab scheduledAt', () => {
    const mut = played().reportResult(
      initiatorActor,
      { winnerMemberIds: [INITIATOR], sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }] },
      AFTER_MATCH,
    )
    expect(mut.kind).toBe('report-result')
  })

  it('cancel ist erlaubt (kein Result da)', () => {
    expect(() => played().cancel(initiatorActor, AFTER_MATCH)).not.toThrow()
  })
})

// ─── DisputedFriendly ────────────────────────────────────────────────────────

describe('DisputedFriendly', () => {
  const disputed = () =>
    new DisputedFriendly({
      row: row({ status: 'DISPUTED' }),
      invitees: [invitee({ status: 'accepted' })],
      result: result({ confirmationStatus: 'disputed' }),
    })

  it('Trainer kann force-confirm', () => {
    expect(() => disputed().trainerForceConfirm(trainerActor, AFTER_MATCH)).not.toThrow()
  })

  it('Nicht-Trainer darf NICHT force-confirm', () => {
    expect(() => disputed().trainerForceConfirm(initiatorActor, AFTER_MATCH)).toThrow(/trainer/i)
  })

  it('Trainer kann cancellen', () => {
    expect(() => disputed().trainerCancel(trainerActor, AFTER_MATCH)).not.toThrow()
  })
})

// ─── Terminal States ─────────────────────────────────────────────────────────

describe('Terminal States', () => {
  it('CompletedFriendly hat keine Aktionen', () => {
    const m = new CompletedFriendly({
      row: row({ status: 'COMPLETED' }),
      invitees: [invitee({ status: 'accepted' })],
      result: result({ confirmationStatus: 'confirmed' }),
    })
    expect('cancel' in m).toBe(false)
    expect('reportResult' in m).toBe(false)
  })

  it('CancelledFriendly hat keine Aktionen', () => {
    const m = new CancelledFriendly({ row: row({ status: 'CANCELLED' }), invitees: [invitee()] })
    expect('cancel' in m).toBe(false)
    expect('reportResult' in m).toBe(false)
  })

  it('DeclinedFriendly hat keine Aktionen', () => {
    const m = new DeclinedFriendly({ row: row({ status: 'DECLINED' }), invitees: [invitee({ status: 'declined' })] })
    expect('cancel' in m).toBe(false)
    expect('reportResult' in m).toBe(false)
  })
})
