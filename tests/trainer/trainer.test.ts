import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { challengesService } from '../../server/modules/challenges'
import { friendliesService, friendlyResultsService } from '../../server/modules/friendlies'
import type { MemberId } from '../../server/modules/members'
import { generateForSeason, rankingReadService, type RankingId } from '../../server/modules/rankings'
import { resultsService } from '../../server/modules/results'
import { seasonsService } from '../../server/modules/seasons'
import { trainerActivityService, trainerDisputesService } from '../../server/modules/trainer'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

function setupSeasonWithMembers(): { memberIds: MemberId[]; rankingId: RankingId } {
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
  const season = seasonsService.create({ name: 'T 2026' })
  seasonsService.addAgeGroup(season.id, {
    name: 'Herren',
    minAge: 18,
    maxAge: null,
    gender: 'm',
    active: true,
  })
  seasonsService.start(season.id)
  generateForSeason(season.id)
  const herren = rankingReadService.list({ seasonId: season.id })[0]!
  return { memberIds, rankingId: herren.id as RankingId }
}

const tomorrow = () => new Date(Date.now() - 30 * 60 * 1000)

describe('Trainer disputes — Liste', () => {
  it('Liste enthält disputed Challenges und Friendlies, sortiert nach disputedAt absteigend', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()

    // Challenge → disputed
    const c1 = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c1.id, memberIds[1])
    const r1 = resultsService.report(c1.id, memberIds[3], {
      winnerId: memberIds[3],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
      matchMode: 'best-of-3-champions',
    })
    resultsService.dispute(r1.id, memberIds[1], { note: 'falscher Score' })

    // Friendly → disputed
    const f = friendliesService.create(memberIds[0], {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [memberIds[2]],
      matchMode: 'best-of-3-champions',
    })
    friendliesService.accept(f.id, memberIds[2])
    const fr = friendlyResultsService.report(f.id, memberIds[0], {
      winnerMemberIds: [memberIds[0]],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
    })
    friendlyResultsService.dispute(fr.id, memberIds[2], { note: 'auch falsch' })

    const list = trainerDisputesService.list()
    expect(list).toHaveLength(2)
    expect(list.map((d) => d.kind).sort()).toEqual(['challenge', 'friendly'])
    // jüngster disputedAt zuerst
    expect(list[0]!.disputedAt.getTime()).toBeGreaterThanOrEqual(list[1]!.disputedAt.getTime())
  })

  it('leere Liste, wenn nichts disputed', () => {
    setupSeasonWithMembers()
    expect(trainerDisputesService.list()).toEqual([])
  })
})

describe('Trainer Confirm Challenge', () => {
  it('confirm bestätigt das gemeldete Ergebnis und mutiert die Rangliste', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()

    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    const r = resultsService.report(c.id, memberIds[3], {
      winnerId: memberIds[3],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
      matchMode: 'best-of-3-champions',
    })
    resultsService.dispute(r.id, memberIds[1], { note: 'streit' })

    trainerDisputesService.confirmChallenge(c.id)

    const after = challengesService.findById(c.id)!
    expect(after.status).toBe('COMPLETED')

    const detail = rankingReadService.getDetail(rankingId)
    const positions = new Map(detail.entries.map((e) => [e.memberId, e.position]))
    expect(positions.get(memberIds[3])).toBe(2) // Sieger nimmt Challenged-Position
    expect(positions.get(memberIds[1])).toBe(3)

    const r2 = resultsService.findById(r.id)!
    expect(r2.confirmationStatus).toBe('confirmed')
    expect(r2.applied).toBe(true)
  })
})

describe('Trainer Cancel Challenge', () => {
  it('cancel macht Challenge CANCELLED, ohne Rangliste-Wirkung', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()

    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    const r = resultsService.report(c.id, memberIds[3], {
      winnerId: memberIds[3],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
      matchMode: 'best-of-3-champions',
    })
    resultsService.dispute(r.id, memberIds[1], { note: 'streit' })

    // Positionen vor Cancel
    const before = rankingReadService.getDetail(rankingId)
    const beforePositions = new Map(before.entries.map((e) => [e.memberId, e.position]))

    trainerDisputesService.cancelChallenge(c.id)

    const after = challengesService.findById(c.id)!
    expect(after.status).toBe('CANCELLED')
    expect(after.cancelledAt).toBeInstanceOf(Date)

    // Rangliste unverändert
    const afterRanking = rankingReadService.getDetail(rankingId)
    for (const e of afterRanking.entries) {
      expect(e.position).toBe(beforePositions.get(e.memberId))
    }
  })

  it('cancel funktioniert auch ohne MatchResult (DISPUTED via 21-Tage-Cron)', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()

    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    challengesService.markDisputed(c.id) // simuliert Cron-Pfad

    trainerDisputesService.cancelChallenge(c.id)

    const after = challengesService.findById(c.id)!
    expect(after.status).toBe('CANCELLED')
  })
})

describe('Trainer Confirm/Cancel Friendly', () => {
  it('confirm Friendly → COMPLETED', () => {
    const { memberIds } = setupSeasonWithMembers()
    const f = friendliesService.create(memberIds[0], {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [memberIds[2]],
      matchMode: 'best-of-3-champions',
    })
    friendliesService.accept(f.id, memberIds[2])
    const fr = friendlyResultsService.report(f.id, memberIds[0], {
      winnerMemberIds: [memberIds[0]],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
    })
    friendlyResultsService.dispute(fr.id, memberIds[2], { note: 'streit' })

    trainerDisputesService.confirmFriendly(f.id)

    const after = friendliesService.findById(f.id)!
    expect(after.status).toBe('COMPLETED')

    // lastFriendlyAt für beide gesetzt (markCompleted setzt das)
    for (const id of [memberIds[0], memberIds[2]]) {
      const m = useDb().select().from(member).where(eq(member.id, id)).get()!
      expect(m.lastFriendlyAt).toBeInstanceOf(Date)
    }
  })

  it('cancel Friendly → CANCELLED', () => {
    const { memberIds } = setupSeasonWithMembers()
    const f = friendliesService.create(memberIds[0], {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [memberIds[2]],
      matchMode: 'best-of-3-champions',
    })
    friendliesService.accept(f.id, memberIds[2])
    const fr = friendlyResultsService.report(f.id, memberIds[0], {
      winnerMemberIds: [memberIds[0]],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
    })
    friendlyResultsService.dispute(fr.id, memberIds[2], { note: 'streit' })

    trainerDisputesService.cancelFriendly(f.id)

    const after = friendliesService.findById(f.id)!
    expect(after.status).toBe('CANCELLED')
    expect(after.cancelledAt).toBeInstanceOf(Date)
  })
})

describe('Trainer Activity-Übersicht', () => {
  it('listet alle Mitglieder, sortiert NULL-zuerst dann ältestes lastMatchAt', () => {
    const { memberIds } = setupSeasonWithMembers()
    const overview = trainerActivityService.overview()
    expect(overview).toHaveLength(memberIds.length)
    // ohne Matches: alle lastMatchAt = null, alle Counts = 0
    for (const row of overview) {
      expect(row.lastMatchAt).toBeNull()
      expect(row.matchesLast4Weeks).toBe(0)
    }
  })

  it('zählt completed Challenges + completed/played Friendlies in 4 Wochen', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()

    // Challenge → confirmed
    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    const r = resultsService.report(c.id, memberIds[3], {
      winnerId: memberIds[3],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
      matchMode: 'best-of-3-champions',
    })
    resultsService.confirm(r.id, memberIds[1])

    // Friendly → played (kein Ergebnis, zählt trotzdem)
    const f = friendliesService.create(memberIds[0], {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [memberIds[2]],
      matchMode: 'best-of-3-champions',
    })
    friendliesService.accept(f.id, memberIds[2])
    friendliesService.markPlayed(f.id, memberIds[0])

    const overview = trainerActivityService.overview()
    const byId = new Map(overview.map((r) => [r.memberId, r]))

    expect(byId.get(memberIds[3])!.matchesLast4Weeks).toBe(1)
    expect(byId.get(memberIds[1])!.matchesLast4Weeks).toBe(1)
    expect(byId.get(memberIds[0])!.matchesLast4Weeks).toBe(1)
    expect(byId.get(memberIds[2])!.matchesLast4Weeks).toBe(1)
    // Alle haben jetzt ein lastMatchAt
    for (const id of [memberIds[0], memberIds[1], memberIds[2], memberIds[3]]) {
      expect(byId.get(id)!.lastMatchAt).toBeInstanceOf(Date)
    }
  })

  it('zählt nicht, wenn completed außerhalb der 4-Wochen-Fenster', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()

    const c = challengesService.create(memberIds[3], { challengedId: memberIds[1], rankingId })
    challengesService.accept(c.id, memberIds[1])
    const r = resultsService.report(c.id, memberIds[3], {
      winnerId: memberIds[3],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
      matchMode: 'best-of-3-champions',
    })
    // Confirm vor 35 Tagen
    const old = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
    resultsService.confirm(r.id, memberIds[1], old)

    const overview = trainerActivityService.overview()
    const p3 = overview.find((row) => row.memberId === memberIds[3])!
    expect(p3.matchesLast4Weeks).toBe(0)
    expect(p3.lastMatchAt).toBeInstanceOf(Date) // hat trotzdem einen Stempel
  })
})
