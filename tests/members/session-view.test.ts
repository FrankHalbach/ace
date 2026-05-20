import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { profileService } from '../../server/modules/members'
import type { MemberId, Role } from '../../server/modules/members'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

function insertMember(opts: {
  firstName: string
  roles?: Role[]
  status?: 'aktiv' | 'pausiert'
  adminDeactivated?: boolean
}): MemberId {
  const row = useDb()
    .insert(member)
    .values({
      email: `${opts.firstName}@x.de`.toLowerCase(),
      firstName: opts.firstName,
      lastName: 'Test',
      birthYear: 1990,
      gender: 'm',
      dtbLk: 10,
      roles: opts.roles ?? ['player'],
      status: opts.status ?? 'aktiv',
    })
    .returning()
    .get()
  if (opts.adminDeactivated) {
    useDb()
      .update(member)
      .set({
        status: 'pausiert',
        deactivatedAt: new Date(),
        deactivationReason: 'austritt',
      })
      .where(eq(member.id, row!.id))
      .run()
  }
  return row!.id
}

describe('profileService.loadSessionView', () => {
  it('liefert undefined fuer unbekannte Member-ID', () => {
    const view = profileService.loadSessionView('xxxxxxxxxxxxxxxx' as MemberId)
    expect(view).toBeUndefined()
  })

  it('liefert aktuelle Rollen aus der DB', () => {
    const id = insertMember({ firstName: 'Anna', roles: ['player', 'admin'] })
    const view = profileService.loadSessionView(id)
    expect(view).toEqual({
      id,
      roles: ['player', 'admin'],
      adminDeactivated: false,
    })
  })

  it('markiert admin-deaktivierte Mitglieder', () => {
    const id = insertMember({ firstName: 'Raus', adminDeactivated: true })
    const view = profileService.loadSessionView(id)
    expect(view?.adminDeactivated).toBe(true)
  })

  it('Self-Pause ist KEINE Admin-Deaktivierung', () => {
    const id = insertMember({ firstName: 'Self', status: 'pausiert' })
    const view = profileService.loadSessionView(id)
    expect(view?.adminDeactivated).toBe(false)
  })
})
