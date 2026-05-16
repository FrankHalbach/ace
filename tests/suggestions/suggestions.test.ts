import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { challengesService } from '../../server/modules/challenges'
import { friendliesService } from '../../server/modules/friendlies'
import type { MemberId } from '../../server/modules/members'
import { generateForSeason, rankingReadService, type RankingId } from '../../server/modules/rankings'
import { resultsService } from '../../server/modules/results'
import { seasonsService } from '../../server/modules/seasons'
import { suggestionsService } from '../../server/modules/suggestions'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

function insertMember(opts: {
  firstName: string
  dtbLk: number
  status?: 'aktiv' | 'pausiert'
  gender?: 'm' | 'w'
}): MemberId {
  const row = useDb()
    .insert(member)
    .values({
      email: `${opts.firstName.toLowerCase()}@x.de`,
      firstName: opts.firstName,
      lastName: 'X',
      birthYear: 1985,
      gender: opts.gender ?? 'm',
      dtbLk: opts.dtbLk,
      status: opts.status ?? 'aktiv',
    })
    .returning()
    .get()
  return row!.id
}

function setupSeasonWithMembers(members: { firstName: string; dtbLk: number }[]): {
  ids: MemberId[]
  rankingId: RankingId
} {
  const ids = members.map((m) => insertMember(m))
  const season = seasonsService.create({ name: 'S 2026' })
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
  return { ids, rankingId: herren.id as RankingId }
}

describe('suggestionsService.suggestFor', () => {
  it('liefert leere Liste, wenn der Viewer pausiert ist', () => {
    const me = insertMember({ firstName: 'Me', dtbLk: 10, status: 'pausiert' })
    insertMember({ firstName: 'Tom', dtbLk: 10 })
    expect(suggestionsService.suggestFor(me)).toEqual([])
  })

  it('filtert Kandidaten mit LK-Differenz > 2 heraus', () => {
    const me = insertMember({ firstName: 'Me', dtbLk: 10 })
    insertMember({ firstName: 'Naah', dtbLk: 10.5 }) // drin (±2)
    insertMember({ firstName: 'Weit', dtbLk: 13 }) // raus (>2)

    const list = suggestionsService.suggestFor(me)
    expect(list.map((s) => s.firstName)).toContain('Naah')
    expect(list.map((s) => s.firstName)).not.toContain('Weit')
  })

  it('filtert pausierte Spieler heraus', () => {
    const me = insertMember({ firstName: 'Me', dtbLk: 10 })
    insertMember({ firstName: 'Aktiv', dtbLk: 10 })
    insertMember({ firstName: 'Pausiert', dtbLk: 10, status: 'pausiert' })

    const list = suggestionsService.suggestFor(me)
    expect(list.map((s) => s.firstName)).toContain('Aktiv')
    expect(list.map((s) => s.firstName)).not.toContain('Pausiert')
  })

  it('filtert nach Cooldown — wer gerade gespielt hat, fällt raus', () => {
    // Pyramide: Challenger muss niedriger gerankt sein als Challenged.
    // Wir ordnen Me ans Ende (höchste LK = niedrigste Position) damit alle
    // anderen für ihn forderbar sind.
    const { ids, rankingId } = setupSeasonWithMembers([
      { firstName: 'B', dtbLk: 9 },
      { firstName: 'C', dtbLk: 10 },
      { firstName: 'D', dtbLk: 11 },
      { firstName: 'Me', dtbLk: 11 },
    ])
    const [b, c, _d, me] = ids

    // Me fordert B (vom unteren Platz nach oben — Pyramide-konform)
    const ch = challengesService.create(me!, { challengedId: b!, rankingId })
    challengesService.accept(ch.id, b!)
    const r = resultsService.report(ch.id, me!, {
      winnerId: me!,
      sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
      matchMode: 'best-of-3-champions',
    })
    resultsService.confirm(r.id, b!)

    const names = suggestionsService.suggestFor(me!).map((s) => s.firstName)
    expect(names).not.toContain('B') // Cooldown
    expect(names).toContain('C')
    void c
  })

  it('priorisiert "Neue Paarung"-Kandidaten gegenüber bereits Gespielten', () => {
    // Me steht unten in der Pyramide, damit er alle anderen fordern darf.
    const { ids, rankingId } = setupSeasonWithMembers([
      { firstName: 'C', dtbLk: 10 },
      { firstName: 'D', dtbLk: 10 },
      { firstName: 'E', dtbLk: 10 },
      { firstName: 'Me', dtbLk: 10.5 }, // letzte Position
    ])
    const [c, _d, _e, me] = ids

    // Vor 30 Tagen: Me hat C gespielt → COMPLETED (außerhalb 14-Tage-Cooldown).
    // D und E sind neue Paarungen, beide ohne Match-Historie → inaktiv-Bonus.
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const ch = challengesService.create(me!, { challengedId: c!, rankingId }, oldDate)
    challengesService.accept(ch.id, c!, oldDate)
    const r = resultsService.report(
      ch.id,
      me!,
      { winnerId: me!, sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }], matchMode: 'best-of-3-champions' },
      oldDate,
    )
    resultsService.confirm(r.id, c!, oldDate)

    const names = suggestionsService.suggestFor(me!).map((s) => s.firstName)
    // D und E sind „neue Paarung" + „inaktiv", müssen vor C kommen
    expect(names.indexOf('D')).toBeLessThan(names.indexOf('C'))
    expect(names.indexOf('E')).toBeLessThan(names.indexOf('C'))
  })

  it('empfiehlt die gemeinsame Rangliste mit kleinstem Positions-Abstand', () => {
    const { ids, rankingId } = setupSeasonWithMembers([
      { firstName: 'Me', dtbLk: 10 },
      { firstName: 'Tom', dtbLk: 10 },
    ])
    const [me, tom] = ids
    const list = suggestionsService.suggestFor(me!)
    const tomS = list.find((s) => s.firstName === 'Tom')!
    expect(tomS.rankingId).toBe(rankingId)
    expect(tomS.rankingName).toBe('Herren')
    void tom // not used directly
  })

  it('liefert max. 5 Vorschläge', () => {
    const me = insertMember({ firstName: 'Me', dtbLk: 10 })
    for (let i = 0; i < 8; i++) {
      insertMember({ firstName: `K${i}`, dtbLk: 10 })
    }
    const list = suggestionsService.suggestFor(me)
    expect(list).toHaveLength(5)
  })

  it('rankingId ist null wenn keine gemeinsame Rangliste existiert', () => {
    // beide Member, aber keine Saison/Rangliste angelegt
    const me = insertMember({ firstName: 'Me', dtbLk: 10 })
    insertMember({ firstName: 'Solo', dtbLk: 10 })
    const list = suggestionsService.suggestFor(me)
    const solo = list.find((s) => s.firstName === 'Solo')!
    expect(solo.rankingId).toBeNull()
    expect(solo.rankingName).toBeNull()
  })

  it('Cooldown gilt auch für laufende Friendlies', () => {
    const me = insertMember({ firstName: 'Me', dtbLk: 10 })
    const tom = insertMember({ firstName: 'Tom', dtbLk: 10 })
    insertMember({ firstName: 'Other', dtbLk: 10 })

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    friendliesService.create(me, {
      format: 'singles',
      scheduledAt: tomorrow,
      opponentIds: [tom],
      matchMode: 'best-of-3-champions',
    })

    const names = suggestionsService.suggestFor(me).map((s) => s.firstName)
    expect(names).not.toContain('Tom') // PROPOSED-Friendly läuft
    expect(names).toContain('Other')
  })
})
