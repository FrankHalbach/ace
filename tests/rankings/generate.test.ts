import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member, type MemberInsert } from '../../server/db/schema/member'
import { generateForSeason, rankingReadService } from '../../server/modules/rankings'
import { seasonsService } from '../../server/modules/seasons'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

function seedMembers(rows: Partial<MemberInsert>[]): void {
  for (const r of rows) {
    useDb()
      .insert(member)
      .values({
        email: r.email ?? `m${Math.random()}@x.de`,
        firstName: r.firstName ?? 'M',
        lastName: r.lastName ?? 'X',
        birthYear: r.birthYear!,
        gender: r.gender!,
        dtbLk: r.dtbLk ?? 10,
      })
      .run()
  }
}

describe('generateForSeason', () => {
  it('erzeugt genau eine Rangliste pro aktiver AgeGroup', () => {
    seedMembers([
      { email: 'h1@x.de', birthYear: 1985, gender: 'm', dtbLk: 8 },
      { email: 'h2@x.de', birthYear: 1985, gender: 'm', dtbLk: 12 },
      { email: 'd1@x.de', birthYear: 1985, gender: 'w', dtbLk: 10 },
    ])
    const season = seasonsService.create({ name: 'Sommer 2026' })
    seasonsService.addAgeGroup(season.id, {
      name: 'Herren',
      minAge: 18,
      maxAge: null,
      gender: 'm',
      active: true,
    })
    seasonsService.addAgeGroup(season.id, {
      name: 'Damen',
      minAge: 18,
      maxAge: null,
      gender: 'w',
      active: true,
    })
    seasonsService.start(season.id)
    const result = generateForSeason(season.id)

    expect(result.rankingsCreated).toBe(2)
    const lists = rankingReadService.list({ seasonId: season.id })
    expect(lists.map((l) => l.ageGroupName).sort()).toEqual(['Damen', 'Herren'])
  })

  it('mixed-AgeGroup nimmt alle Geschlechter auf', () => {
    seedMembers([
      { email: 'j1@x.de', birthYear: 2010, gender: 'm', dtbLk: 18 },
      { email: 'j2@x.de', birthYear: 2010, gender: 'w', dtbLk: 19 },
    ])
    const season = seasonsService.create({ name: 'Sommer 2026' })
    seasonsService.addAgeGroup(season.id, {
      name: 'U18',
      minAge: 15,
      maxAge: 17,
      gender: 'mixed',
      active: true,
    })
    seasonsService.start(season.id)
    generateForSeason(season.id)

    const lists = rankingReadService.list({ seasonId: season.id })
    expect(lists).toHaveLength(1)
    expect(lists[0].ageGroupName).toBe('U18')
    expect(lists[0].entryCount).toBe(2)
  })

  it('Herren-AgeGroup filtert nach Geschlecht und Altersbereich', () => {
    seedMembers([
      { email: 'h1@x.de', birthYear: 1985, gender: 'm', dtbLk: 8 },  // Aktive
      { email: 'h2@x.de', birthYear: 2015, gender: 'm', dtbLk: 12 }, // zu jung
      { email: 'd1@x.de', birthYear: 1985, gender: 'w', dtbLk: 10 }, // weiblich → nicht in Herren
    ])
    const season = seasonsService.create({ name: 'Sommer 2026' })
    seasonsService.addAgeGroup(season.id, {
      name: 'Herren',
      minAge: 18,
      maxAge: null,
      gender: 'm',
      active: true,
    })
    seasonsService.start(season.id)
    generateForSeason(season.id)

    const lists = rankingReadService.list({ seasonId: season.id })
    expect(lists).toHaveLength(1)
    expect(lists[0].entryCount).toBe(1)
  })

  it('initiale Positionen nach LK aufsteigend (Pyramide-Default)', () => {
    seedMembers([
      { email: 'a@x.de', firstName: 'A', birthYear: 1985, gender: 'm', dtbLk: 15 },
      { email: 'b@x.de', firstName: 'B', birthYear: 1985, gender: 'm', dtbLk: 8 },
      { email: 'c@x.de', firstName: 'C', birthYear: 1985, gender: 'm', dtbLk: 11 },
    ])
    const season = seasonsService.create({ name: 'Sommer 2026' })
    seasonsService.addAgeGroup(season.id, {
      name: 'Herren',
      minAge: 18,
      maxAge: null,
      gender: 'm',
      active: true,
    })
    seasonsService.start(season.id)
    generateForSeason(season.id)

    const lists = rankingReadService.list({ seasonId: season.id })
    const herren = lists[0]!
    const detail = rankingReadService.getDetail(herren.id)
    expect(detail.entries.map((e) => e.member.firstName)).toEqual(['B', 'C', 'A'])
    expect(detail.entries.map((e) => e.position)).toEqual([1, 2, 3])
  })

  it('idempotent: zweimaliger Aufruf erzeugt nichts Neues', () => {
    seedMembers([{ email: 'h@x.de', birthYear: 1985, gender: 'm', dtbLk: 10 }])
    const season = seasonsService.create({ name: 'Sommer 2026' })
    seasonsService.addAgeGroup(season.id, {
      name: 'Herren',
      minAge: 18,
      maxAge: null,
      gender: 'm',
      active: true,
    })
    seasonsService.start(season.id)
    const first = generateForSeason(season.id)
    const second = generateForSeason(season.id)
    expect(first.rankingsCreated).toBe(1)
    expect(second.rankingsCreated).toBe(0)
  })

  it('inaktive AgeGroups werden ignoriert', () => {
    seedMembers([{ email: 'h@x.de', birthYear: 1985, gender: 'm', dtbLk: 10 }])
    const season = seasonsService.create({ name: 'Sommer 2026' })
    seasonsService.addAgeGroup(season.id, {
      name: 'Herren',
      minAge: 18,
      maxAge: null,
      gender: 'm',
      active: false,
    })
    seasonsService.start(season.id)
    generateForSeason(season.id)

    expect(rankingReadService.list({ seasonId: season.id })).toHaveLength(0)
  })
})
