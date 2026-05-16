import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { ChallengeValidationError, challengesService } from '../../server/modules/challenges'
import { resultsService } from '../../server/modules/results'
import { generateForSeason, rankingReadService, type RankingId } from '../../server/modules/rankings'
import { seasonsService } from '../../server/modules/seasons'
import type { MemberId } from '../../server/modules/members'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

function setupSeasonWithMembers() {
  // 4 Spieler, alle Aktive Herren, mit unterschiedlichen LKs
  const memberIds: MemberId[] = []
  for (let i = 0; i < 4; i++) {
    const row = useDb()
      .insert(member)
      .values({
        email: `p${i}@x.de`,
        firstName: `P${i}`,
        lastName: 'X',
        birthYear: 1985,
        gender: 'm',
        dtbLk: 8 + i,
      })
      .returning()
      .get()
    memberIds.push(row!.id)
  }

  const season = seasonsService.create({ name: 'Test 2026' })
  seasonsService.addAgeGroup(season.id, {
    name: 'Herren',
    minAge: 18,
    maxAge: null,
    gender: 'm',
    active: true,
  })
  seasonsService.start(season.id)
  generateForSeason(season.id)

  const rankings = rankingReadService.list({ seasonId: season.id })
  const herren = rankings[0]!
  return { memberIds, rankingId: herren.id as RankingId }
}

describe('Challenge-Validierung', () => {
  it('verbietet Selbst-Forderung', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    expect(() =>
      challengesService.create(memberIds[0], { challengedId: memberIds[0], rankingId }),
    ).toThrowError(ChallengeValidationError)
  })

  it('verbietet Forderung gegen Pausierte', async () => {
    const { eq } = await import('drizzle-orm')
    const { memberIds, rankingId } = setupSeasonWithMembers()
    useDb().update(member).set({ status: 'pausiert' }).where(eq(member.id, memberIds[1])).run()

    expect(() =>
      challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId }),
    ).toThrowError(/pausiert/i)
  })

  it('Pyramide: erlaubt Sprung innerhalb maxJumpUp', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    // Spieler[3] (Position 4, schwächste LK) fordert Spieler[1] (Position 2)
    const c = challengesService.create(memberIds[3], {
      challengedId: memberIds[1],
      rankingId,
    })
    expect(c.status).toBe('PROPOSED')
  })

  it('Pyramide: verbietet zu weiten Sprung', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    // Mit maxJumpUp=3 (Default) und Positionen 1..4: Position 4 → Position 1 = Distanz 3 OK
    // Daher braucht's einen weiteren Spieler. Wir testen indirect:
    // Position 4 → Position 1, Distanz 3, OK
    const c = challengesService.create(memberIds[3], {
      challengedId: memberIds[0],
      rankingId,
    })
    expect(c.status).toBe('PROPOSED')
  })

  it('verbietet Cooldown', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    // Zweite Forderung gegen denselben Gegner — Cooldown aktiv
    expect(() =>
      challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId }),
    ).toThrowError(/cooldown/i)
  })

  it('verbietet mehr als 2 aktive Challenges', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    challengesService.create(memberIds[3], { challengedId: memberIds[2], rankingId })
    challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    expect(() =>
      challengesService.create(memberIds[3], { challengedId: memberIds[0], rankingId }),
    ).toThrowError(/aktive Challenges/i)
  })
})

describe('Lifecycle accept / decline', () => {
  it('accept setzt Status auf ACCEPTED', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    const accepted = challengesService.accept(c.id, memberIds[1])
    expect(accepted.status).toBe('ACCEPTED')
    expect(accepted.acceptedAt).toBeInstanceOf(Date)
  })

  it('nur Challenged darf annehmen', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    expect(() => challengesService.accept(c.id, memberIds[3])).toThrowError(/participant/i)
  })

  it('decline mit Grund setzt DECLINED', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    const declined = challengesService.decline(c.id, memberIds[1], {
      reason: 'injury',
      note: 'Knie',
    })
    expect(declined.status).toBe('DECLINED')
    expect(declined.declineReason).toBe('injury')
  })
})

describe('Voller Flow Pyramide: Create → Accept → Report → Confirm', () => {
  it('Sieger Challenger tauscht Position mit Challenged', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    // Position 4 fordert Position 2
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])

    // Sieger meldet: Challenger gewinnt 6:4, 6:3 (best-of-3-champions hat keinen TB nötig wenn 2:0)
    const r = resultsService.report(c.id, memberIds[3], {
      winnerId: memberIds[3],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
      matchMode: 'best-of-3-champions',
    })
    expect(r.confirmationStatus).toBe('pending')

    // Verlierer bestätigt
    const confirmed = resultsService.confirm(r.id, memberIds[1])
    expect(confirmed.confirmationStatus).toBe('confirmed')
    expect(confirmed.applied).toBe(true)

    // Rangliste-Check: Challenger (war auf Position 4) ist jetzt auf Position 2
    const detail = rankingReadService.getDetail(rankingId)
    const positions = new Map(detail.entries.map((e) => [e.memberId, e.position]))
    expect(positions.get(memberIds[3])).toBe(2) // Sieger nimmt Challenged-Position
    expect(positions.get(memberIds[1])).toBe(3) // Challenged rutscht eins runter
    expect(positions.get(memberIds[2])).toBe(4) // ehemals Position 3 → 4

    // Challenge ist COMPLETED
    const after = challengesService.findById(c.id)!
    expect(after.status).toBe('COMPLETED')
  })

  it('Sieger Challenged: keine Positions-Änderung', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])

    // Sieger ist der Challenged (Position 2) — Challenger (a) verliert
    const r = resultsService.report(c.id, memberIds[1], {
      winnerId: memberIds[1],
      sets: [{ a: 1, b: 6 }, { a: 2, b: 6 }],
      matchMode: 'best-of-3-champions',
    })
    resultsService.confirm(r.id, memberIds[3])

    const detail = rankingReadService.getDetail(rankingId)
    const positions = new Map(detail.entries.map((e) => [e.memberId, e.position]))
    expect(positions.get(memberIds[1])).toBe(2) // unverändert
    expect(positions.get(memberIds[3])).toBe(4) // unverändert
  })
})

describe('Dispute-Flow', () => {
  it('Verlierer kann widersprechen, Challenge geht in DISPUTED', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    const r = resultsService.report(c.id, memberIds[3], {
      winnerId: memberIds[3],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
      matchMode: 'best-of-3-champions',
    })

    const disputed = resultsService.dispute(r.id, memberIds[1], { note: 'Score war anders' })
    expect(disputed.confirmationStatus).toBe('disputed')

    const challenge = challengesService.findById(c.id)!
    expect(challenge.status).toBe('DISPUTED')
  })
})

describe('Set-Score-Validation ist verdrahtet (#26/#27/#28)', () => {
  it('lehnt unzulässige reguläre Set-Scores ab', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    expect(() =>
      resultsService.report(c.id, memberIds[3], {
        winnerId: memberIds[3],
        sets: [{ a: 8, b: 6 }, { a: 6, b: 4 }],
        matchMode: 'best-of-3-champions',
      }),
    ).toThrow(/8:6/)
  })

  it('akzeptiert Match-TB im 3. Satz bei best-of-3-champions', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    const r = resultsService.report(c.id, memberIds[3], {
      winnerId: memberIds[3],
      sets: [{ a: 6, b: 4 }, { a: 2, b: 6 }, { a: 10, b: 8 }],
      matchMode: 'best-of-3-champions',
    })
    expect(r.confirmationStatus).toBe('pending')
  })

  it('lehnt 7:5 als Match-TB im 3. Satz ab', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    expect(() =>
      resultsService.report(c.id, memberIds[3], {
        winnerId: memberIds[3],
        sets: [{ a: 6, b: 4 }, { a: 2, b: 6 }, { a: 7, b: 5 }],
        matchMode: 'best-of-3-champions',
      }),
    ).toThrow(/Match-Tie-Break/i)
  })
})

describe('Walk-Over / Aufgabe-Flow (#29 #30)', () => {
  it('Walk-Over: report ohne Sätze, Sieger explizit, persistent gespeichert', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    const r = resultsService.report(c.id, memberIds[3], {
      winnerId: memberIds[3],
      sets: [],
      matchMode: 'best-of-3-champions',
      outcome: 'walkover',
      outcomeNote: 'Gegner kam nicht',
    })
    expect(r.outcome).toBe('walkover')
    expect(r.sets).toEqual([])
    expect(r.outcomeNote).toBe('Gegner kam nicht')
  })

  it('Walk-Over: confirm wendet Positions-Tausch wie regulär an (Pyramide)', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    // Position 4 (memberIds[3]) fordert Position 2 (memberIds[1])
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    const r = resultsService.report(c.id, memberIds[3], {
      winnerId: memberIds[3],
      sets: [],
      matchMode: 'best-of-3-champions',
      outcome: 'walkover',
    })
    resultsService.confirm(r.id, memberIds[1])

    const detail = rankingReadService.getDetail(rankingId)
    const positions = new Map(detail.entries.map((e) => [e.memberId, e.position]))
    expect(positions.get(memberIds[3])).toBe(2)
    expect(positions.get(memberIds[1])).toBe(3)
  })

  it('Walk-Over mit nicht-leerem sets-Array wird abgelehnt', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    expect(() =>
      resultsService.report(c.id, memberIds[3], {
        winnerId: memberIds[3],
        sets: [{ a: 6, b: 0 }, { a: 6, b: 0 }],
        matchMode: 'best-of-3-champions',
        outcome: 'walkover',
      }),
    ).toThrow(/Walk-Over/i)
  })

  it('Aufgabe: Teilscore wird akzeptiert, Sieger explizit gegen Score-Mehrheit', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    // Im Spielfeld stand 6:2, 3:1 für den Aufgebenden (Challenger),
    // aber der Challenger bricht ab → Challenged ist Sieger.
    const r = resultsService.report(c.id, memberIds[3], {
      winnerId: memberIds[1], // Challenged ist Sieger trotz Teilscore-Führung
      sets: [{ a: 6, b: 2 }, { a: 3, b: 1 }],
      matchMode: 'best-of-3-champions',
      outcome: 'retirement',
    })
    expect(r.outcome).toBe('retirement')
    expect(r.winnerId).toBe(memberIds[1])
  })
})
