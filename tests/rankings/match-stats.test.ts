import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { challengesService } from '../../server/modules/challenges'
import { resultsService } from '../../server/modules/results'
import {
  generateForSeason,
  rankingReadService,
  type RankingId,
} from '../../server/modules/rankings'
import { seasonsService } from '../../server/modules/seasons'
import type { MemberId } from '../../server/modules/members'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

function setupSeasonWithMembers(suffix: string = 'a') {
  const memberIds: MemberId[] = []
  for (let i = 0; i < 4; i++) {
    const row = useDb()
      .insert(member)
      .values({
        email: `stats-${suffix}-${i}@x.de`,
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
  const season = seasonsService.create({ name: `Stats-${suffix}` })
  // points-table-Modus, damit der Pyramid-Sprung-Validator nicht stört;
  // wir testen hier reine Match-Stats-Aggregation, nicht Modus-Logik.
  seasonsService.update(season.id, { config: { defaultMode: 'points-table' } })
  seasonsService.addAgeGroup(season.id, {
    name: 'Herren',
    minAge: 18,
    maxAge: null,
    gender: 'm',
    active: true,
  })
  seasonsService.start(season.id)
  generateForSeason(season.id)
  const rankingId = rankingReadService.list({ seasonId: season.id })[0]!.id as RankingId
  return { memberIds, rankingId }
}

function playMatch(
  rankingId: RankingId,
  challenger: MemberId,
  challenged: MemberId,
  winner: MemberId,
  opts: { outcome?: 'regular' | 'walkover' | 'retirement' } = {},
) {
  const c = challengesService.create(challenger, { challengedId: challenged, rankingId })
  challengesService.accept(c.id, challenged)
  // Sets `{a, b}` sind aus Sicht von Challenger (a) und Challenged (b);
  // müssen zum winner passen.
  const challengerWins = winner === challenger
  const sets =
    opts.outcome === 'walkover'
      ? []
      : challengerWins
        ? [{ a: 6, b: 4 }, { a: 6, b: 2 }]
        : [{ a: 4, b: 6 }, { a: 2, b: 6 }]
  const r = resultsService.report(c.id, winner, {
    winnerId: winner,
    sets,
    matchMode: 'two-sets-match-tiebreak',
    outcome: opts.outcome,
  })
  // Verlierer bestätigt
  const loser = challengerWins ? challenged : challenger
  resultsService.confirm(r.id, loser)
}

describe('rankingReadService.getMatchStats', () => {
  it('leere Rangliste → leere Map', () => {
    const { rankingId } = setupSeasonWithMembers()
    const stats = rankingReadService.getMatchStats(rankingId)
    expect(stats.size).toBe(0)
  })

  it('zählt für beide Spieler ein gespieltes Match und genau einen Sieg', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const [a, b] = memberIds
    playMatch(rankingId, a!, b!, a!)
    const stats = rankingReadService.getMatchStats(rankingId)
    expect(stats.get(a!)).toEqual({ played: 1, won: 1 })
    expect(stats.get(b!)).toEqual({ played: 1, won: 0 })
  })

  it('akkumuliert über mehrere Matches', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const [a, b, c, d] = memberIds
    playMatch(rankingId, a!, b!, a!) // a 1/1, b 1/0
    playMatch(rankingId, c!, a!, a!) // a 2/2, c 1/0
    playMatch(rankingId, d!, b!, b!) // b 2/1, d 1/0
    const stats = rankingReadService.getMatchStats(rankingId)
    expect(stats.get(a!)).toEqual({ played: 2, won: 2 })
    expect(stats.get(b!)).toEqual({ played: 2, won: 1 })
    expect(stats.get(c!)).toEqual({ played: 1, won: 0 })
    expect(stats.get(d!)).toEqual({ played: 1, won: 0 })
  })

  it('Walk-Over: Sieger bekommt played+won, Verlierer played aber not won', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const [a, b] = memberIds
    playMatch(rankingId, a!, b!, a!, { outcome: 'walkover' })
    const stats = rankingReadService.getMatchStats(rankingId)
    expect(stats.get(a!)).toEqual({ played: 1, won: 1 })
    expect(stats.get(b!)).toEqual({ played: 1, won: 0 })
  })

  it('ignoriert pending Match-Results', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const [a, b] = memberIds
    const c = challengesService.create(a!, { challengedId: b!, rankingId })
    challengesService.accept(c.id, b!)
    resultsService.report(c.id, a!, {
      winnerId: a!,
      sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }],
      matchMode: 'two-sets-match-tiebreak',
    })
    // KEIN confirm — bleibt pending
    const stats = rankingReadService.getMatchStats(rankingId)
    expect(stats.size).toBe(0)
  })

  it('grenzt nach Rangliste ab — andere Rangliste zählt nicht mit', () => {
    // Zwei separate Setups, jeweils eigene Mitglieder + Rangliste, damit die
    // Stats-Filter rein über die Ranking-ID greifen müssen.
    const { memberIds: m1, rankingId: r1 } = setupSeasonWithMembers('one')
    const { memberIds: m2, rankingId: r2 } = setupSeasonWithMembers('two')
    playMatch(r1, m1[0]!, m1[1]!, m1[0]!)
    playMatch(r2, m2[0]!, m2[1]!, m2[1]!)
    expect(rankingReadService.getMatchStats(r1).get(m1[0]!)).toEqual({ played: 1, won: 1 })
    expect(rankingReadService.getMatchStats(r1).get(m2[0]!)).toBeUndefined()
  })
})

describe('rankingReadService.getDetail — matchesPlayed/matchesWon im Entry', () => {
  it('reicht die Stats jeder Position zu', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const [a, b] = memberIds
    playMatch(rankingId, a!, b!, a!)
    const detail = rankingReadService.getDetail(rankingId)
    const ea = detail.entries.find((e) => e.memberId === a!)!
    const eb = detail.entries.find((e) => e.memberId === b!)!
    expect(ea.matchesPlayed).toBe(1)
    expect(ea.matchesWon).toBe(1)
    expect(eb.matchesPlayed).toBe(1)
    expect(eb.matchesWon).toBe(0)
  })

  it('Mitglieder ohne Match haben 0/0', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()
    const detail = rankingReadService.getDetail(rankingId)
    for (const id of memberIds) {
      const e = detail.entries.find((x) => x.memberId === id)!
      expect(e.matchesPlayed).toBe(0)
      expect(e.matchesWon).toBe(0)
    }
  })
})
