import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member, type MemberId } from '../../server/db/schema/member'
import { MemberNotFoundError, profileService, updateOwnProfileInput } from '../../server/modules/members'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

function seedMember(): MemberId {
  const row = useDb()
    .insert(member)
    .values({
      email: 'TEST@neureut.de',
      firstName: 'Test',
      lastName: 'User',
      birthYear: 1990,
      gender: 'm',
    })
    .returning()
    .get()
  return row!.id
}

describe('profileService', () => {
  it('findByEmail ist case-insensitive', () => {
    seedMember()
    expect(profileService.findByEmail('test@neureut.de')).toBeDefined()
    expect(profileService.findByEmail('TEST@NEUREUT.DE')).toBeDefined()
  })

  it('getOwnProfile liefert das eigene Profil', () => {
    const id = seedMember()
    const profile = profileService.getOwnProfile(id)
    expect(profile.firstName).toBe('Test')
    expect(profile.dtbLk).toBe(25) // Default
    expect(profile.status).toBe('aktiv')
    expect(profile.preferences.singlesChallenges).toBe(true)
  })

  it('getOwnProfile wirft bei unbekannter ID', () => {
    expect(() => profileService.getOwnProfile('999' as MemberId)).toThrow(MemberNotFoundError)
  })

  it('updateOwnProfile aktualisiert nur die übergebenen Felder', () => {
    const id = seedMember()
    profileService.updateOwnProfile(id, { firstName: 'Maximilian', dtbLk: 7.5 })
    const after = profileService.getOwnProfile(id)
    expect(after.firstName).toBe('Maximilian')
    expect(after.lastName).toBe('User') // unverändert
    expect(after.dtbLk).toBe(7.5)
  })

  describe('updateOwnProfileInput-Validierung', () => {
    it('akzeptiert vollständige gültige Eingabe', () => {
      const result = updateOwnProfileInput.safeParse({
        firstName: 'Max',
        lastName: 'Müller',
        birthYear: 1985,
        gender: 'm',
        dtbLk: 8.3,
        status: 'aktiv',
        preferences: {
          singlesChallenges: true,
          singlesFriendly: true,
          doublesFriendly: false,
          mixedFriendly: false,
          ageGroupFriendly: false,
        },
      })
      expect(result.success).toBe(true)
    })

    it('weist DTB-LK außerhalb 1–25 ab', () => {
      const result = updateOwnProfileInput.safeParse({ dtbLk: 30 })
      expect(result.success).toBe(false)
    })

    it('weist unbekannte Felder ab (strict)', () => {
      const result = updateOwnProfileInput.safeParse({ unknownField: 'x' })
      expect(result.success).toBe(false)
    })

    it('weist Geburtsjahr außerhalb 1920–2020 ab', () => {
      const result = updateOwnProfileInput.safeParse({ birthYear: 1800 })
      expect(result.success).toBe(false)
    })
  })
})
