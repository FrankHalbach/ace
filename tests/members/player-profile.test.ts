import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { challengesService } from '../../server/modules/challenges'
import { friendliesService, friendlyResultsService } from '../../server/modules/friendlies'
import { getMemberProfile, type MemberId } from '../../server/modules/members'
import { generateForSeason, rankingReadService, type RankingId } from '../../server/modules/rankings'
import { resultsService } from '../../server/modules/results'
import { seasonsService } from '../../server/modules/seasons'
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

describe('Spieler-Profil', () => {
  it('liefert Basics, Rangliste-Position und leere Match-Historie für frischen Spieler', () => {
    const { memberIds } = setupSeasonWithMembers()

    const profile = getMemberProfile(memberIds[0]!, memberIds[0]!)

    expect(profile.firstName).toBe('P0')
    expect(profile.email).toBe('p0@x.de') // eigenes Profil → Email sichtbar
    expect(profile.matchesLast4Weeks).toBe(0)
    expect(profile.lastMatchAt).toBeNull()
    expect(profile.matches).toEqual([])
    expect(profile.rankings.length).toBeGreaterThan(0) // ist in herren rangliste
  })

  it('versteckt Email für andere Viewer', () => {
    const { memberIds } = setupSeasonWithMembers()
    const profile = getMemberProfile(memberIds[0]!, memberIds[1]!) // anderer viewer
    expect(profile.email).toBeNull()
  })

  it('listet completed Challenges in der Match-Historie mit Sieg/Niederlage', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()

    const c = challengesService.create(memberIds[3]!, { challengedId: memberIds[1]!, rankingId })
    challengesService.accept(c.id, memberIds[1]!)
    const r = resultsService.report(c.id, memberIds[3]!, {
      winnerId: memberIds[3]!,
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
      matchMode: 'best-of-3-champions',
    })
    resultsService.confirm(r.id, memberIds[1]!)

    const winnerProfile = getMemberProfile(memberIds[3]!, memberIds[3]!)
    expect(winnerProfile.matches).toHaveLength(1)
    const m = winnerProfile.matches[0]!
    if (m.kind !== 'challenge') throw new Error('expected challenge')
    expect(m.result).toBe('win')
    expect(m.opponentId).toBe(memberIds[1]!)
    expect(m.sets).toEqual([{ a: 6, b: 4 }, { a: 6, b: 3 }])

    const loserProfile = getMemberProfile(memberIds[1]!, memberIds[1]!)
    expect(loserProfile.matches).toHaveLength(1)
    const m2 = loserProfile.matches[0]!
    if (m2.kind !== 'challenge') throw new Error('expected challenge')
    expect(m2.result).toBe('loss')
  })

  it('listet PLAYED Friendlies (ohne Ergebnis) in der Historie ohne Sieg/Niederlage', () => {
    const { memberIds } = setupSeasonWithMembers()

    const f = friendliesService.create(memberIds[0]!, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [memberIds[2]!],
      matchMode: 'best-of-3-champions',
    })
    friendliesService.accept(f.id, memberIds[2]!)
    friendliesService.markPlayed(f.id, memberIds[0]!)

    const profile = getMemberProfile(memberIds[0]!, memberIds[0]!)
    expect(profile.matches).toHaveLength(1)
    const m = profile.matches[0]!
    if (m.kind !== 'friendly') throw new Error('expected friendly')
    expect(m.result).toBeNull()
    expect(m.format).toBe('singles')
    expect(m.opponentNames).toEqual(['P2 X'])
  })

  it('listet completed Friendly mit Sieger-Markierung', () => {
    const { memberIds } = setupSeasonWithMembers()

    const f = friendliesService.create(memberIds[0]!, {
      format: 'singles',
      scheduledAt: tomorrow(),
      opponentIds: [memberIds[2]!],
      matchMode: 'best-of-3-champions',
    })
    friendliesService.accept(f.id, memberIds[2]!)
    const fr = friendlyResultsService.report(f.id, memberIds[0]!, {
      winnerMemberIds: [memberIds[0]!],
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
    })
    friendlyResultsService.confirm(fr.id, memberIds[2]!)

    const winnerProfile = getMemberProfile(memberIds[0]!, memberIds[0]!)
    const wm = winnerProfile.matches[0]!
    if (wm.kind !== 'friendly') throw new Error('expected friendly')
    expect(wm.result).toBe('win')

    const loserProfile = getMemberProfile(memberIds[2]!, memberIds[2]!)
    const lm = loserProfile.matches[0]!
    if (lm.kind !== 'friendly') throw new Error('expected friendly')
    expect(lm.result).toBe('loss')
  })

  it('zählt matchesLast4Weeks korrekt', () => {
    const { memberIds, rankingId } = setupSeasonWithMembers()

    const c = challengesService.create(memberIds[3]!, { challengedId: memberIds[1]!, rankingId })
    challengesService.accept(c.id, memberIds[1]!)
    const r = resultsService.report(c.id, memberIds[3]!, {
      winnerId: memberIds[3]!,
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
      matchMode: 'best-of-3-champions',
    })
    resultsService.confirm(r.id, memberIds[1]!)

    const profile = getMemberProfile(memberIds[3]!, memberIds[3]!)
    expect(profile.matchesLast4Weeks).toBe(1)
    expect(profile.lastMatchAt).toBeInstanceOf(Date)
  })
})
