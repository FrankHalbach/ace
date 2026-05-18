import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { friendliesService } from '../../server/modules/friendlies'
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

const at = (offsetHours: number) =>
  new Date(Date.now() + offsetHours * 60 * 60 * 1000)

describe('Friendly Schedule-Konflikt (N-04)', () => {
  it('blockt Create wenn Initiator schon ein Match in dem Fenster hat', () => {
    const [a, b, c] = insertMembers(3)
    friendliesService.create(a, {
      format: 'singles',
      scheduledAt: at(24),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    expect(() =>
      friendliesService.create(a, {
        format: 'singles',
        scheduledAt: at(25), // 1h später — innerhalb ±2h
        opponentIds: [c],
        matchMode: 'two-sets-match-tiebreak',
      }),
    ).toThrowError(/schedule-conflict|bereits ein Match/i)
  })

  it('blockt Create wenn ein Eingeladener schon ein Match in dem Fenster hat', () => {
    const [a, b, c] = insertMembers(3)
    friendliesService.create(b, {
      format: 'singles',
      scheduledAt: at(24),
      opponentIds: [c],
      matchMode: 'two-sets-match-tiebreak',
    })
    expect(() =>
      friendliesService.create(a, {
        format: 'singles',
        scheduledAt: at(25), // c hängt schon im 24h-Slot
        opponentIds: [c],
        matchMode: 'two-sets-match-tiebreak',
      }),
    ).toThrowError(/schedule-conflict|bereits ein Match/i)
  })

  it('erlaubt Create wenn das andere Match mehr als 2h entfernt ist', () => {
    const [a, b, c] = insertMembers(3)
    friendliesService.create(a, {
      format: 'singles',
      scheduledAt: at(24),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    expect(() =>
      friendliesService.create(a, {
        format: 'singles',
        scheduledAt: at(27), // 3h später → außerhalb Fenster
        opponentIds: [c],
        matchMode: 'two-sets-match-tiebreak',
      }),
    ).not.toThrow()
  })

  it('erlaubt Create wenn das andere Match DECLINED ist (keine aktive Buchung)', () => {
    const [a, b, c] = insertMembers(3)
    const first = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: at(24),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    friendliesService.decline(first.id, b)
    expect(() =>
      friendliesService.create(a, {
        format: 'singles',
        scheduledAt: at(24),
        opponentIds: [c],
        matchMode: 'two-sets-match-tiebreak',
      }),
    ).not.toThrow()
  })

  it('blockt Accept wenn der Eingeladene ein anderes Match im Slot hat', async () => {
    // Defensive-Check für Race/Pre-Existing-Data — über normale API
    // verhindert der Create-Check diesen Zustand bereits. Hier umgehen wir
    // den Create-Check, indem wir das zweite Friendly direkt in die DB
    // schreiben.
    const { friendly } = await import('../../server/db/schema/friendly')
    const { friendlyInvitee } = await import('../../server/db/schema/friendly-invitee')
    const [a, b, c] = insertMembers(3)
    const proposed = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: at(40),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    // Direct-DB-Insert eines zweiten Friendlies, das b ebenfalls auf 40h legt
    const ghostRow = useDb()
      .insert(friendly)
      .values({
        initiatorId: c,
        format: 'singles',
        scheduledAt: at(40),
        matchMode: 'two-sets-match-tiebreak',
        status: 'PROPOSED',
        createdAt: new Date(),
      })
      .returning()
      .get()
    useDb()
      .insert(friendlyInvitee)
      .values({
        friendlyId: ghostRow!.id,
        memberId: b,
        team: 'opponent',
        createdAt: new Date(),
      })
      .run()
    // b kann das ursprünglich vorgeschlagene Friendly nicht mehr annehmen
    expect(() => friendliesService.accept(proposed.id, b)).toThrowError(
      /schedule-conflict|bereits ein Match/i,
    )
  })

  it('erlaubt Accept des einzigen Konflikts (= das Friendly selbst)', () => {
    const [a, b] = insertMembers(2)
    const f = friendliesService.create(a, {
      format: 'singles',
      scheduledAt: at(24),
      opponentIds: [b],
      matchMode: 'two-sets-match-tiebreak',
    })
    // Es gibt nur EINEN Eintrag im Slot — den, den b akzeptiert. Nicht blocken.
    expect(() => friendliesService.accept(f.id, b)).not.toThrow()
  })
})
