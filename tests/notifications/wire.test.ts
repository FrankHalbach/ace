import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { challengesService } from '../../server/modules/challenges'
import { friendliesService } from '../../server/modules/friendlies'
import type { MemberId } from '../../server/modules/members'
import { generateForSeason, rankingReadService, type RankingId } from '../../server/modules/rankings'
import { resultsService } from '../../server/modules/results'
import { seasonsService } from '../../server/modules/seasons'
import { createTestDb } from '../helpers/test-db'

const sendEmailMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../../server/shared/email-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/shared/email-transport')>()
  return {
    ...actual,
    sendEmail: (...args: Parameters<typeof actual.sendEmail>) => sendEmailMock(...args),
  }
})

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())
afterEach(() => sendEmailMock.mockClear())

function insertMembers(n: number, ageBase = 1985): MemberId[] {
  const ids: MemberId[] = []
  for (let i = 0; i < n; i++) {
    const row = useDb()
      .insert(member)
      .values({
        email: `p${i}@x.de`,
        firstName: `P${i}`,
        lastName: 'X',
        birthYear: ageBase,
        gender: 'm',
        dtbLk: 8 + i,
      })
      .returning()
      .get()
    ids.push(row!.id)
  }
  return ids
}

function setupRankingForChallenges(): { memberIds: MemberId[]; rankingId: RankingId } {
  const memberIds = insertMembers(4)
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
  return { memberIds, rankingId: rankings[0]!.id as RankingId }
}

function emailsByKind(kind: string): { to: { email: string }; subject: string; kind: string }[] {
  return sendEmailMock.mock.calls
    .map((c) => c[0])
    .filter((p): p is { to: { email: string }; subject: string; kind: string } => p.kind === kind)
}

async function flushMicrotasks(): Promise<void> {
  // dispatchMany läuft async + void; einmaliges setImmediate reicht.
  await new Promise((r) => setImmediate(r))
}

describe('Friendlies — FR-70 Notifikationen', () => {
  it('friendly.invited bei create() an alle Eingeladenen, mit deutschem Subject', async () => {
    const [a, b, c, d] = insertMembers(4)
    friendliesService.create(a, {
      format: 'doubles',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      partnerId: b,
      opponentIds: [c, d],
      matchMode: 'two-sets-match-tiebreak',
    })
    await flushMicrotasks()

    const calls = emailsByKind('friendly.invited')
    expect(calls).toHaveLength(3)
    const emails = new Set(calls.map((p) => p.to.email))
    expect(emails).toEqual(new Set(['p1@x.de', 'p2@x.de', 'p3@x.de']))
    expect(calls[0]!.subject).toMatch(/Doppel-Einladung von P0 X/)
  })

  it('friendly.accepted geht an den Initiator', async () => {
    const [a, b] = insertMembers(2)
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    sendEmailMock.mockClear()
    friendliesService.accept(f.id, b)
    await flushMicrotasks()

    const calls = emailsByKind('friendly.accepted')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.to.email).toBe('p0@x.de')
  })

  it('friendly.declined geht an den Initiator', async () => {
    const [a, b] = insertMembers(2)
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    sendEmailMock.mockClear()
    friendliesService.decline(f.id, b)
    await flushMicrotasks()

    const calls = emailsByKind('friendly.declined')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.to.email).toBe('p0@x.de')
  })

  it('friendly.cancelled geht an alle eingeladenen Spieler', async () => {
    const [a, b, c, d] = insertMembers(4)
    const f = friendliesService.create(a, {
      format: 'doubles',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      partnerId: b,
      opponentIds: [c, d],
      matchMode: 'two-sets-match-tiebreak',
    })
    sendEmailMock.mockClear()
    friendliesService.cancel(f.id, a)
    await flushMicrotasks()

    const calls = emailsByKind('friendly.cancelled')
    expect(calls).toHaveLength(3)
  })
})

describe('Challenges — FR-70 Notifikationen', () => {
  it('challenge.received an den Geforderten', async () => {
    const { memberIds, rankingId } = setupRankingForChallenges()
    sendEmailMock.mockClear()

    challengesService.create(memberIds[3]!, { challengedId: memberIds[1]!, rankingId })
    await flushMicrotasks()

    const calls = emailsByKind('challenge.received')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.to.email).toBe('p1@x.de') // der Geforderte
  })

  it('challenge.accepted an den Forderer', async () => {
    const { memberIds, rankingId } = setupRankingForChallenges()
    const c = challengesService.create(memberIds[3]!, {
      challengedId: memberIds[1]!,
      rankingId,
    })
    sendEmailMock.mockClear()

    challengesService.accept(c.id, memberIds[1]!)
    await flushMicrotasks()

    const calls = emailsByKind('challenge.accepted')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.to.email).toBe('p3@x.de') // der Forderer
  })

  it('challenge.declined an den Forderer, mit Grund im Body', async () => {
    const { memberIds, rankingId } = setupRankingForChallenges()
    const c = challengesService.create(memberIds[3]!, {
      challengedId: memberIds[1]!,
      rankingId,
    })
    sendEmailMock.mockClear()

    challengesService.decline(c.id, memberIds[1]!, { reason: 'injury', note: 'Knie' })
    await flushMicrotasks()

    const calls = emailsByKind('challenge.declined')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.to.email).toBe('p3@x.de')
  })

  it('challenge.result_reported an den Verlierer', async () => {
    const { memberIds, rankingId } = setupRankingForChallenges()
    const c = challengesService.create(memberIds[3]!, {
      challengedId: memberIds[1]!,
      rankingId,
    })
    challengesService.accept(c.id, memberIds[1]!)
    sendEmailMock.mockClear()

    // Gewinner = Forderer (memberIds[3]); Verlierer = Geforderter (memberIds[1])
    // Format: 2 reguläre Sätze, hier Sieger=a, also memberIds[3] gewinnt 6:4 6:3.
    resultsService.report(c.id, memberIds[3]!, {
      winnerId: memberIds[3]!,
      sets: [
        { a: 6, b: 4 },
        { a: 6, b: 3 },
      ],
      matchMode: 'two-sets-match-tiebreak',
    })
    await flushMicrotasks()

    const calls = emailsByKind('challenge.result_reported')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.to.email).toBe('p1@x.de') // Verlierer
  })
})

describe('Notif-Toggle deaktiviert Mail', () => {
  it('respektiert notificationPrefs.challenge.received=false', async () => {
    const { memberIds, rankingId } = setupRankingForChallenges()
    // Geforderter dreht challenge.received aus
    const { eq } = await import('drizzle-orm')
    useDb()
      .update(member)
      .set({
        notificationPrefs: {
          'challenge.received': false,
          'challenge.accepted': true,
          'challenge.declined': true,
          'challenge.expired': true,
          'challenge.result_reported': true,
          'challenge.result_confirmed': true,
          'challenge.result_disputed': true,
          'friendly.invited': true,
          'friendly.accepted': true,
          'friendly.declined': true,
          'friendly.cancelled': true,
          'friendly.result_reported': true,
          'friendly.result_confirmed': true,
          'friendly.result_disputed': true,
        },
      })
      .where(eq(member.id, memberIds[1]!))
      .run()

    sendEmailMock.mockClear()
    challengesService.create(memberIds[3]!, { challengedId: memberIds[1]!, rankingId })
    await flushMicrotasks()

    expect(emailsByKind('challenge.received')).toHaveLength(0)
  })
})
