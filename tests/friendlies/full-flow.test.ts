import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { friendliesService, friendlyResultsService } from '../../server/modules/friendlies'
import type { MemberId } from '../../server/modules/members'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

function insertMembers(n: number): MemberId[] {
  const ids: MemberId[] = []
  for (let i = 0; i < n; i++) {
    const row = useDb()
      .insert(member)
      .values({
        email: `p${i}@x.de`,
        firstName: `P${i}`,
        lastName: 'X',
        birthYear: 1985,
        gender: i % 2 === 0 ? 'm' : 'w',
        dtbLk: 8 + i,
      })
      .returning()
      .get()
    ids.push(row!.id)
  }
  return ids
}

// Test-Termin: 30 Minuten in der Vergangenheit. Liegt innerhalb der
// 1h-Toleranz von friendliesService.create und erlaubt direkten Result-
// Report (validateSetsForMode/AcceptedFriendly braucht now >= scheduledAt).
const tomorrow = () => new Date(Date.now() - 30 * 60 * 1000)

describe('Friendly-Validierung', () => {
  it('verbietet Selbst-Einladung', () => {
    const [a] = insertMembers(2)
    expect(() =>
      friendliesService.create(a, {
        format: 'singles',
        scheduledAt: tomorrow(),
        opponentIds: [a],
        matchMode: 'two-sets-match-tiebreak',
      }),
    ).toThrowError(/selbst/i)
  })

  it('verbietet doppelten Spieler im Team', () => {
    const [a, b] = insertMembers(3)
    expect(() =>
      friendliesService.create(a, {
        format: 'doubles',
        scheduledAt: tomorrow(),
        partnerId: b,
        opponentIds: [b, b], // b doppelt
        matchMode: 'two-sets-match-tiebreak',
      }),
    ).toThrowError(/mehrfach/i)
  })

  it('verbietet Termin in der Vergangenheit', () => {
    const [a, b] = insertMembers(2)
    expect(() =>
      friendliesService.create(a, {
        format: 'singles',
        scheduledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        opponentIds: [b],
        matchMode: 'two-sets-match-tiebreak',
      }),
    ).toThrowError(/vergangenheit/i)
  })

  it('verbietet Einladung gegen Pausierte', async () => {
    const { eq } = await import('drizzle-orm')
    const [a, b] = insertMembers(2)
    useDb().update(member).set({ status: 'pausiert' }).where(eq(member.id, b)).run()
    expect(() =>
      friendliesService.create(a, {
        format: 'singles',
        scheduledAt: tomorrow(),
        opponentIds: [b],
        matchMode: 'two-sets-match-tiebreak',
      }),
    ).toThrowError(/pausiert/i)
  })

  it('Singles braucht genau 1 Eingeladenen, Doubles 3', () => {
    const [a, b, c, d] = insertMembers(4)
    // Singles mit 2 Gegnern → Team-Shape verletzt (Service-Layer)
    expect(() =>
      friendliesService.create(a, {
        format: 'singles',
        scheduledAt: tomorrow(),
        opponentIds: [b, c],
        matchMode: 'two-sets-match-tiebreak',
      } as never),
    ).toThrowError()
    // Doubles ohne Partner → Team-Shape verletzt
    expect(() =>
      friendliesService.create(a, {
        format: 'doubles',
        scheduledAt: tomorrow(),
        opponentIds: [c, d],
        matchMode: 'two-sets-match-tiebreak',
      } as never),
    ).toThrowError()
  })
})

describe('Lifecycle Singles: Create → Accept → Result → Confirm', () => {
  it('Singles: Initiator gewinnt, Verlierer bestätigt → Friendly COMPLETED', () => {
    const [a, b] = insertMembers(2)

    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    expect(f.status).toBe('PROPOSED')
    expect(f.invitees).toHaveLength(1)

    // b nimmt an → CONFIRMED
    const confirmed = friendliesService.accept(f.id, b)
    expect(confirmed.status).toBe('CONFIRMED')
    expect(confirmed.invitees[0]!.status).toBe('accepted')

    // a meldet Sieg
    const r = friendlyResultsService.report(f.id, a, {
      winnerMemberIds: [a],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
    })
    expect(r.confirmationStatus).toBe('pending')
    expect(r.matchMode).toBe('two-sets-match-tiebreak')

    // b (Verlierer) bestätigt
    const confirmedResult = friendlyResultsService.confirm(r.id, b)
    expect(confirmedResult.confirmationStatus).toBe('confirmed')
    expect(confirmedResult.confirmedBy).toBe(b)

    const after = friendliesService.findById(f.id)!
    expect(after.status).toBe('COMPLETED')

    // lastFriendlyAt für beide Teilnehmer gesetzt
    for (const id of [a, b]) {
      const m = useDb().select().from(member).where(eq(member.id, id)).get()!
      expect(m.lastFriendlyAt).toBeInstanceOf(Date)
    }
  })

  it('Singles: nur Verlierer darf bestätigen', () => {
    const [a, b] = insertMembers(2)
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    friendliesService.accept(f.id, b)
    const r = friendlyResultsService.report(f.id, a, {
      winnerMemberIds: [a],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
    })
    // Sieger versucht zu bestätigen → not-loser
    expect(() => friendlyResultsService.confirm(r.id, a)).toThrowError(/loser/i)
  })

  it('Singles: Sieger-Konsistenz wird geprüft (gewählter Sieger passt nicht zu den Sätzen)', () => {
    const [a, b] = insertMembers(2)
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    friendliesService.accept(f.id, b)
    expect(() =>
      friendlyResultsService.report(f.id, a, {
        winnerMemberIds: [a], // a soll Sieger sein
        sets: [
          { a: 1, b: 6 },
          { a: 2, b: 6 },
        ], // tatsächlich hat b gewonnen
      }),
    ).toThrowError(/inkonsistenz/i)
  })

  it('Singles: Decline macht Friendly DECLINED', () => {
    const [a, b] = insertMembers(2)
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    const declined = friendliesService.decline(f.id, b)
    expect(declined.status).toBe('DECLINED')
  })

  it('Singles: Cancel durch Initiator', () => {
    const [a, b] = insertMembers(2)
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    const cancelled = friendliesService.cancel(f.id, a)
    expect(cancelled.status).toBe('CANCELLED')
  })

  it('Singles: PLAYED-Pfad ohne Ergebnis stempelt last_friendly_at', () => {
    const [a, b] = insertMembers(2)
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    friendliesService.accept(f.id, b)
    const played = friendliesService.markPlayed(f.id, a)
    expect(played.status).toBe('PLAYED')

    for (const id of [a, b]) {
      const m = useDb().select().from(member).where(eq(member.id, id)).get()!
      expect(m.lastFriendlyAt).toBeInstanceOf(Date)
    }
  })
})

describe('Lifecycle Doubles: Create → 3x Accept → Result → Confirm', () => {
  it('Doubles: alle drei Eingeladenen müssen zustimmen', () => {
    const [a, p, o1, o2] = insertMembers(4)

    const f = friendliesService.create(a, {
      format: 'doubles',
      scheduledAt: tomorrow(),
      partnerId: p,
      opponentIds: [o1, o2],
      matchMode: 'two-sets-match-tiebreak',
    })
    expect(f.status).toBe('PROPOSED')
    expect(f.invitees).toHaveLength(3)

    // Erste zwei Akzeptanzen → bleibt PROPOSED
    let after = friendliesService.accept(f.id, p)
    expect(after.status).toBe('PROPOSED')
    after = friendliesService.accept(f.id, o1)
    expect(after.status).toBe('PROPOSED')

    // Dritte Akzeptanz → CONFIRMED
    after = friendliesService.accept(f.id, o2)
    expect(after.status).toBe('CONFIRMED')
    expect(after.invitees.every((i) => i.status === 'accepted')).toBe(true)
  })

  it('Doubles: ein Decline macht Friendly DECLINED, egal welches Team', () => {
    const [a, p, o1, o2] = insertMembers(4)
    const f = friendliesService.create(a, {
      format: 'doubles',
      scheduledAt: tomorrow(),
      partnerId: p,
      opponentIds: [o1, o2],
      matchMode: 'two-sets-match-tiebreak',
    })
    friendliesService.accept(f.id, p)
    const declined = friendliesService.decline(f.id, o1)
    expect(declined.status).toBe('DECLINED')
  })

  it('Doubles: Sieger-Team-Report + Verlierer-Team bestätigt', () => {
    const [a, p, o1, o2] = insertMembers(4)
    const f = friendliesService.create(a, {
      format: 'doubles',
      scheduledAt: tomorrow(),
      partnerId: p,
      opponentIds: [o1, o2],
      matchMode: 'two-sets-match-tiebreak',
    })
    friendliesService.accept(f.id, p)
    friendliesService.accept(f.id, o1)
    friendliesService.accept(f.id, o2)

    // Initiator-Team gewinnt
    const r = friendlyResultsService.report(f.id, a, {
      winnerMemberIds: [a, p],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
    })
    expect(r.confirmationStatus).toBe('pending')
    expect(r.winnerMemberIds).toEqual([a, p])

    // o1 (Verlierer) bestätigt — first wins, o2 nicht nötig
    const confirmed = friendlyResultsService.confirm(r.id, o1)
    expect(confirmed.confirmationStatus).toBe('confirmed')
    const after = friendliesService.findById(f.id)!
    expect(after.status).toBe('COMPLETED')
  })

  it('Doubles: zweiter Bestätigung schlägt fehl (already-confirmed)', () => {
    const [a, p, o1, o2] = insertMembers(4)
    const f = friendliesService.create(a, {
      format: 'doubles',
      scheduledAt: tomorrow(),
      partnerId: p,
      opponentIds: [o1, o2],
      matchMode: 'two-sets-match-tiebreak',
    })
    friendliesService.accept(f.id, p)
    friendliesService.accept(f.id, o1)
    friendliesService.accept(f.id, o2)
    const r = friendlyResultsService.report(f.id, a, {
      winnerMemberIds: [a, p],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
    })
    friendlyResultsService.confirm(r.id, o1)
    expect(() => friendlyResultsService.confirm(r.id, o2)).toThrowError(/already.confirmed|immutable/i)
  })
})

describe('Dispute-Flow', () => {
  it('Verlierer-Team kann widersprechen → Friendly DISPUTED', () => {
    const [a, b] = insertMembers(2)
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    friendliesService.accept(f.id, b)
    const r = friendlyResultsService.report(f.id, a, {
      winnerMemberIds: [a],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
    })
    const disputed = friendlyResultsService.dispute(r.id, b, { note: 'Score war anders' })
    expect(disputed.confirmationStatus).toBe('disputed')
    const after = friendliesService.findById(f.id)!
    expect(after.status).toBe('DISPUTED')
  })

  it('Auto-Dispute schlägt nach 3 Tagen zu', () => {
    const [a, b] = insertMembers(2)
    // Back-date scheduledAt + create-now, damit der spätere report mit
    // old=4d ago semantisch nach dem Termin liegt (#47-Fix).
    const longAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    const f = friendliesService.create(
      a,
      {
        format: 'singles',
        scheduledAt: longAgo,
        opponentIds: [b],
        matchMode: 'two-sets-match-tiebreak',
      },
      longAgo,
    )
    friendliesService.accept(f.id, b, longAgo)
    const old = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
    const r = friendlyResultsService.report(
      f.id,
      a,
      { winnerMemberIds: [a], sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }] },
      old,
    )
    expect(r.confirmationStatus).toBe('pending')
    const n = friendlyResultsService.autoDisputeStale()
    expect(n).toBe(1)
    const reread = friendlyResultsService.findById(r.id)!
    expect(reread.confirmationStatus).toBe('disputed')
  })
})

describe('Friendly-Listing für Mitglied', () => {
  it('listet Friendlies auf, in denen ich Initiator oder Eingeladener bin', () => {
    const [a, b, c] = insertMembers(3)
    // Zwei Termine außerhalb des Schedule-Konflikt-Fensters (±2h, siehe N-04)
    friendliesService.create(a, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    friendliesService.create(c, {
      format: 'singles',
      scheduledAt: new Date(tomorrow().getTime() + 5 * 60 * 60 * 1000),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    const list = friendliesService.listForMember(b)
    expect(list).toHaveLength(2)
  })
})

// ─── Integration-Tests für die Domain-Bug-Fixes ──────────────────────────────

describe('Domain-Modell: Bug-Fixes #47 (Result vor Termin)', () => {
  it('Result-Report VOR scheduledAt wird abgelehnt', () => {
    const [a, b] = insertMembers(2)
    // Termin liegt 30 min in der Vergangenheit (tomorrow()), wir nehmen aber
    // einen now-Wert 2h davor → schon vor scheduledAt
    const past = new Date(Date.now() - 30 * 60 * 1000) // = tomorrow() = scheduledAt
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: past,
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    friendliesService.accept(f.id, b)

    // Versuche Report mit now = 1h VOR scheduledAt
    const beforeMatch = new Date(past.getTime() - 60 * 60 * 1000)
    expect(() =>
      friendlyResultsService.report(
        f.id,
        a,
        { winnerMemberIds: [a], sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }] },
        beforeMatch,
      ),
    ).toThrow()
  })

  it('Result-Report transitioniert Friendly auf PLAYED', () => {
    const [a, b] = insertMembers(2)
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    friendliesService.accept(f.id, b)
    friendlyResultsService.report(f.id, a, {
      winnerMemberIds: [a],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }],
    })
    // Friendly sollte jetzt PLAYED sein, nicht mehr CONFIRMED.
    const f2 = friendliesService.findById(f.id)
    expect(f2?.status).toBe('PLAYED')
  })
})

describe('Domain-Modell: Bug-Fixes #48 (Cancel nach Result-Report)', () => {
  it('Cancel nach Report wird abgelehnt', () => {
    const [a, b] = insertMembers(2)
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    friendliesService.accept(f.id, b)
    friendlyResultsService.report(f.id, a, {
      winnerMemberIds: [a],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }],
    })
    // Initiator versucht jetzt zu cancellen — soll fehlschlagen
    expect(() => friendliesService.cancel(f.id, a)).toThrow()
  })

  it('Cancel vor Report ist weiter erlaubt (PROPOSED)', () => {
    const [a, b] = insertMembers(2)
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    // Noch kein Accept, noch kein Result → Cancel geht
    const result = friendliesService.cancel(f.id, a)
    expect(result.status).toBe('CANCELLED')
  })
})
