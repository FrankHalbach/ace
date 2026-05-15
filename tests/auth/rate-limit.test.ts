import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { RateLimitExceededError } from '../../server/modules/auth'
import { rateLimitService } from '../../server/modules/auth/service/rate-limit'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

describe('rateLimitService.enforceMagicLink', () => {
  it('erlaubt drei Versuche pro Stunde, blockt den vierten', () => {
    const email = 'max@neureut.de'

    expect(() => rateLimitService.enforceMagicLink(email)).not.toThrow()
    expect(() => rateLimitService.enforceMagicLink(email)).not.toThrow()
    expect(() => rateLimitService.enforceMagicLink(email)).not.toThrow()
    expect(() => rateLimitService.enforceMagicLink(email)).toThrowError(RateLimitExceededError)
  })

  it('trennt Limits pro Email-Adresse', () => {
    rateLimitService.enforceMagicLink('a@neureut.de')
    rateLimitService.enforceMagicLink('a@neureut.de')
    rateLimitService.enforceMagicLink('a@neureut.de')

    expect(() => rateLimitService.enforceMagicLink('b@neureut.de')).not.toThrow()
  })

  it('ist case-insensitive für Email-Adressen', () => {
    rateLimitService.enforceMagicLink('Max@Neureut.de')
    rateLimitService.enforceMagicLink('MAX@neureut.de')
    rateLimitService.enforceMagicLink('max@neureut.de')

    expect(() => rateLimitService.enforceMagicLink('max@neureut.de')).toThrowError(RateLimitExceededError)
  })

  it('vergisst Events außerhalb des Stunden-Fensters', () => {
    const email = 'old@neureut.de'
    const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2h alt
    rateLimitService.enforceMagicLink(email, longAgo)
    rateLimitService.enforceMagicLink(email, longAgo)
    rateLimitService.enforceMagicLink(email, longAgo)

    expect(() => rateLimitService.enforceMagicLink(email)).not.toThrow()
  })
})
