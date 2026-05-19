import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { season } from '../../server/db/schema/season'
import {
  friendliesService,
  friendlyResultsService,
  FriendlyValidationError,
} from '../../server/modules/friendlies'
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
        email: `lc${i}@x.de`,
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

function insertActiveSeason(config: Record<string, unknown> = {}) {
  useDb()
    .insert(season)
    .values({ name: 'Late-Cancel-Test', status: 'ACTIVE', config })
    .run()
}

const hours = (h: number) => h * 60 * 60 * 1000

/**
 * Erzeugt einen Friendly über Direct-DB-Insert, um beliebige `scheduledAt`
 * setzen zu können — die Create-API würde Vergangenheits-Termine über die
 * 1h-Toleranz hinaus ablehnen.
 */
async function seedFriendly(initiator: MemberId, invitee: MemberId, scheduledAt: Date) {
  const { friendly } = await import('../../server/db/schema/friendly')
  const { friendlyInvitee } = await import('../../server/db/schema/friendly-invitee')
  const row = useDb()
    .insert(friendly)
    .values({
      initiatorId: initiator,
      format: 'singles',
      scheduledAt,
      matchMode: 'two-sets-match-tiebreak',
      status: 'PROPOSED',
      createdAt: new Date(),
    })
    .returning()
    .get()!
  useDb()
    .insert(friendlyInvitee)
    .values({
      friendlyId: row.id,
      memberId: invitee,
      team: 'opponent',
      createdAt: new Date(),
    })
    .run()
  return row
}

describe('Friendly Late-Cancellation (N-05)', () => {
  describe('Default-Fenster (2h) ohne aktive Saison', () => {
    it('blockt Decline 1h vor scheduledAt', async () => {
      const [a, b] = insertMembers(2)
      const f = await seedFriendly(a, b, new Date(Date.now() + hours(1)))
      expect(() => friendliesService.decline(f.id, b))
        .toThrowError(/Absage nicht mehr möglich/i)
    })

    it('erlaubt Decline 3h vor scheduledAt', async () => {
      const [a, b] = insertMembers(2)
      const f = await seedFriendly(a, b, new Date(Date.now() + hours(3)))
      const out = friendliesService.decline(f.id, b)
      expect(out.status).toBe('DECLINED')
    })

    it('blockt Cancel 1h vor scheduledAt', async () => {
      const [a, b] = insertMembers(2)
      const f = await seedFriendly(a, b, new Date(Date.now() + hours(1)))
      expect(() => friendliesService.cancel(f.id, a))
        .toThrowError(/Absage nicht mehr möglich/i)
    })

    it('erlaubt Cancel 3h vor scheduledAt', async () => {
      const [a, b] = insertMembers(2)
      const f = await seedFriendly(a, b, new Date(Date.now() + hours(3)))
      const out = friendliesService.cancel(f.id, a)
      expect(out.status).toBe('CANCELLED')
    })

    it('blockt mit Code `friendly.late-cancellation`', async () => {
      const [a, b] = insertMembers(2)
      const f = await seedFriendly(a, b, new Date(Date.now() + hours(0.5)))
      try {
        friendliesService.cancel(f.id, a)
        expect.fail('cancel sollte werfen')
      } catch (err) {
        expect(err).toBeInstanceOf(FriendlyValidationError)
        expect((err as FriendlyValidationError).code).toBe('friendly.late-cancellation')
      }
    })
  })

  describe('Saison-Override', () => {
    it('respektiert größeres Fenster (24h) aus Season.config', async () => {
      insertActiveSeason({ lateCancellationWindowHours: 24 })
      const [a, b] = insertMembers(2)
      // 12h vor Termin — würde mit Default 2h erlaubt, mit 24h blockiert
      const f = await seedFriendly(a, b, new Date(Date.now() + hours(12)))
      expect(() => friendliesService.cancel(f.id, a))
        .toThrowError(/Absage nicht mehr möglich/i)
    })

    it('respektiert kleineres Fenster (30 min) aus Season.config', async () => {
      insertActiveSeason({ lateCancellationWindowHours: 0.5 })
      const [a, b] = insertMembers(2)
      // 1h vor Termin — würde mit Default 2h blockiert, mit 30min erlaubt
      const f = await seedFriendly(a, b, new Date(Date.now() + hours(1)))
      const out = friendliesService.cancel(f.id, a)
      expect(out.status).toBe('CANCELLED')
    })

    it('fenster 0 erlaubt Cancel bis exakt scheduledAt', async () => {
      insertActiveSeason({ lateCancellationWindowHours: 0 })
      const [a, b] = insertMembers(2)
      // 5 min vor Termin — mit 0h-Fenster erlaubt (Grenze ist scheduledAt)
      const f = await seedFriendly(a, b, new Date(Date.now() + 5 * 60 * 1000))
      const out = friendliesService.cancel(f.id, a)
      expect(out.status).toBe('CANCELLED')
    })

    it('blockt nach scheduledAt auch mit Fenster 0', async () => {
      insertActiveSeason({ lateCancellationWindowHours: 0 })
      const [a, b] = insertMembers(2)
      // 1 min nach Termin — auch ohne Vorlauf-Fenster gilt: vorbei ist vorbei
      const f = await seedFriendly(a, b, new Date(Date.now() - 60 * 1000))
      expect(() => friendliesService.cancel(f.id, a)).toThrow(/Absage nicht mehr möglich/i)
    })
  })

  describe('Trainer-Override und PLAYED-Recovery', () => {
    it('cancelByTrainer ignoriert das Fenster (greift nur für DISPUTED)', async () => {
      // Setup: Friendly bis DISPUTED hochziehen, dann scheduledAt zurück-
      // datieren, damit ein Default-Cancel scheitern WÜRDE. Trainer darf trotzdem.
      const { friendly } = await import('../../server/db/schema/friendly')
      const [a, b] = insertMembers(2)
      const future = new Date(Date.now() + hours(10))
      const f = friendliesService.create(a, {
        format: 'singles',
        scheduledAt: future,
        opponentIds: [b],
        matchMode: 'two-sets-match-tiebreak',
      })
      friendliesService.accept(f.id, b)
      // Result reporten mit now nach scheduledAt (sonst lehnt der Service ab)
      const after = new Date(future.getTime() + 60 * 60 * 1000)
      friendlyResultsService.report(f.id, a, {
        winnerMemberIds: [a],
        sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }],
      }, after)
      const reported = friendliesService.findById(f.id)!
      // Wir holen die Result-ID, damit wir disputen können
      const result = friendlyResultsService.findForFriendly(f.id)!
      friendlyResultsService.dispute(result.id, b, { note: 'Test-Dispute' }, after)
      expect(friendliesService.findById(f.id)!.status).toBe('DISPUTED')

      // Jetzt scheduledAt in die unmittelbare Zukunft (innerhalb 2h-Fenster)
      useDb()
        .update(friendly)
        .set({ scheduledAt: new Date(Date.now() + 30 * 60 * 1000) })
        .where(eq(friendly.id, reported.id))
        .run()

      // Trainer darf das DISPUTED-Match jetzt cancellen — Fenster wird ignoriert
      const out = friendliesService.cancelByTrainer(f.id)
      expect(out.status).toBe('CANCELLED')
    })

    it('erlaubt Initiator-Cancel im PLAYED-Status auch nach scheduledAt (Recovery)', async () => {
      // PLAYED kommt zustande, wenn jemand markPlayed ruft. Danach kann der
      // Initiator noch zurückrudern („wir haben doch nicht gespielt"). Diese
      // Recovery soll von N-05 nicht blockiert werden.
      const [a, b] = insertMembers(2)
      const f = friendliesService.create(a, {
        format: 'singles',
        scheduledAt: new Date(Date.now() + hours(10)),
        opponentIds: [b],
        matchMode: 'two-sets-match-tiebreak',
      })
      friendliesService.accept(f.id, b)
      // Marker — markPlayed setzt PLAYED ungeachtet der Zeit (für Tests OK)
      friendliesService.markPlayed(f.id, a)
      expect(friendliesService.findById(f.id)!.status).toBe('PLAYED')
      // Cancel jetzt: scheduledAt-window greift NICHT für PLAYED
      const out = friendliesService.cancel(f.id, a)
      expect(out.status).toBe('CANCELLED')
    })
  })

  describe('DTO-Feld cancellationLockedAt', () => {
    it('ist scheduledAt minus Default-Fenster (2h)', async () => {
      const [a, b] = insertMembers(2)
      const f = await seedFriendly(a, b, new Date(Date.now() + hours(10)))
      const dto = friendliesService.findById(f.id)!
      const expected = dto.scheduledAt.getTime() - hours(2)
      expect(new Date(dto.cancellationLockedAt).getTime()).toBe(expected)
    })

    it('reflektiert Saison-Override (24h)', async () => {
      insertActiveSeason({ lateCancellationWindowHours: 24 })
      const [a, b] = insertMembers(2)
      const f = await seedFriendly(a, b, new Date(Date.now() + hours(48)))
      const dto = friendliesService.findById(f.id)!
      const expected = dto.scheduledAt.getTime() - hours(24)
      expect(new Date(dto.cancellationLockedAt).getTime()).toBe(expected)
    })
  })
})
