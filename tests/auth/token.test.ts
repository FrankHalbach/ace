import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { useDb } from '../../server/db'
import { member, type MemberId } from '../../server/db/schema/member'
import { confirmMagicLink, tokenService, InvalidTokenError } from '../../server/modules/auth'
import {
  INVITE_TOKEN_TTL_MS,
  MAGIC_LINK_TTL_MS,
} from '../../server/modules/auth/service/token'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

function seedMember(): MemberId {
  const row = useDb()
    .insert(member)
    .values({
      email: 'test@neureut.de',
      firstName: 'Test',
      lastName: 'User',
      birthYear: 1990,
      gender: 'm',
    })
    .returning()
    .get()
  return row!.id
}

describe('tokenService', () => {
  it('erzeugt einen Token, der genau einmal konsumierbar ist', () => {
    const memberId = seedMember()
    const token = tokenService.issue(memberId)

    expect(token).toHaveLength(64) // 32 Bytes hex
    const resolvedId = tokenService.consume(token)
    expect(resolvedId).toBe(memberId)

    expect(() => tokenService.consume(token)).toThrow(InvalidTokenError)
  })

  it('weist unbekannte Tokens ab', () => {
    expect(() => tokenService.consume('does-not-exist')).toThrowError(/unknown/)
  })

  it('weist abgelaufene Tokens ab', () => {
    const memberId = seedMember()
    const longAgo = new Date('2020-01-01T00:00:00Z')
    const token = tokenService.issue(memberId, longAgo)

    expect(() => tokenService.consume(token)).toThrowError(/expired/)
  })

  it('cleanupExpired löscht nur abgelaufene Tokens', () => {
    const memberId = seedMember()
    const long_ago = new Date('2020-01-01T00:00:00Z')
    tokenService.issue(memberId, long_ago)
    const fresh = tokenService.issue(memberId)

    const deleted = tokenService.cleanupExpired()
    expect(deleted).toBe(1)

    // Fresh Token bleibt nutzbar
    expect(() => tokenService.consume(fresh)).not.toThrow()
  })

  it('issueInvite verwendet 30-Tage-TTL statt 15 min', () => {
    const memberId = seedMember()
    const now = new Date('2026-05-01T12:00:00Z')
    const inviteToken = tokenService.issueInvite(memberId, now)
    const loginToken = tokenService.issue(memberId, now)

    expect(inviteToken).not.toBe(loginToken)
    expect(inviteToken).toHaveLength(64)

    // Sanity: TTLs sind unterschiedlich
    expect(INVITE_TOKEN_TTL_MS).toBeGreaterThan(MAGIC_LINK_TTL_MS)
    // 30 Tage in ms
    expect(INVITE_TOKEN_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })
})

describe('confirmMagicLink — firstLoginAt', () => {
  it('setzt firstLoginAt beim ersten Konsum, lässt ihn bei weiteren Logins stehen', () => {
    const memberId = seedMember()

    const t1 = tokenService.issue(memberId)
    confirmMagicLink(t1)
    const first = useDb().select().from(member).where(eq(member.id, memberId)).get()!
    expect(first.firstLoginAt).toBeInstanceOf(Date)
    const stamp = first.firstLoginAt!.getTime()

    // Zweiter Login — firstLoginAt bleibt unverändert
    const t2 = tokenService.issue(memberId)
    confirmMagicLink(t2)
    const second = useDb().select().from(member).where(eq(member.id, memberId)).get()!
    expect(second.firstLoginAt!.getTime()).toBe(stamp)
  })

  it('setzt firstLoginAt auch nach Invite-Konsum', () => {
    const memberId = seedMember()
    const token = tokenService.issueInvite(memberId)

    confirmMagicLink(token)

    const m = useDb().select().from(member).where(eq(member.id, memberId)).get()!
    expect(m.firstLoginAt).toBeInstanceOf(Date)
  })
})
