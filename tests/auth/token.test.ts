import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member, type MemberId } from '../../server/db/schema/member'
import { tokenService, InvalidTokenError } from '../../server/modules/auth'
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
})
