import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { auditService } from '../../server/modules/admin'
import {
  CannotRemoveLastAdminError,
  MemberDuplicateEmailError,
  MemberNotFoundError,
  MustKeepPlayerRoleError,
  memberAdminService,
  type MemberId,
  type Role,
} from '../../server/modules/members'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

type SeedOptions = {
  roles?: Role[]
  deactivated?: boolean
}

function insertMember(
  firstName: string,
  lastName: string,
  opts: SeedOptions = {},
): MemberId {
  const row = useDb()
    .insert(member)
    .values({
      email: `${firstName}.${lastName}@x.de`.toLowerCase(),
      firstName,
      lastName,
      birthYear: 1990,
      gender: 'm',
      dtbLk: 10,
      roles: opts.roles ?? ['player'],
    })
    .returning()
    .get()
  if (opts.deactivated) {
    useDb()
      .update(member)
      .set({ deactivatedAt: new Date(), deactivationReason: 'austritt' })
      .where(eq(member.id, row!.id))
      .run()
  }
  return row!.id
}

describe('memberAdminService.listAll', () => {
  it('sortiert alphabetisch nach Nachname, dann Vorname', () => {
    insertMember('Bea', 'Zorn')
    insertMember('Anna', 'Anders')
    insertMember('Beni', 'Anders')
    const list = memberAdminService.listAll()
    expect(list.map((m) => `${m.firstName} ${m.lastName}`)).toEqual([
      'Anna Anders',
      'Beni Anders',
      'Bea Zorn',
    ])
  })

  it('liefert auch deaktivierte Mitglieder und Lifecycle-Felder', () => {
    insertMember('Aktiv', 'Spieler')
    insertMember('Raus', 'Gegangen', { deactivated: true })
    const list = memberAdminService.listAll()
    expect(list).toHaveLength(2)
    const raus = list.find((m) => m.lastName === 'Gegangen')!
    expect(raus.deactivatedAt).not.toBeNull()
    expect(raus.deactivationReason).toBe('austritt')
    expect(raus.invitedAt).toBeNull()
    expect(raus.firstLoginAt).toBeNull()
  })
})

describe('memberAdminService.setRoles', () => {
  it('fuegt trainer-Rolle hinzu und schreibt Audit-Eintrag', () => {
    const admin = insertMember('Anna', 'Admin', { roles: ['admin', 'player'] })
    const tom = insertMember('Tom', 'Weber')

    const updated = memberAdminService.setRoles(tom, ['player', 'trainer'], admin)
    expect(updated.roles.sort()).toEqual(['player', 'trainer'])

    const audits = auditService.listRecent()
    expect(audits[0]?.action).toBe('member.role-changed')
    expect(audits[0]?.subjectId).toBe(tom)
    expect(audits[0]?.before).toEqual({ roles: ['player'] })
    expect(audits[0]?.after).toMatchObject({ roles: expect.arrayContaining(['player', 'trainer']) })
  })

  it('schreibt keinen Audit-Eintrag wenn sich die Rollen nicht aendern', () => {
    const admin = insertMember('Anna', 'Admin', { roles: ['admin', 'player'] })
    const tom = insertMember('Tom', 'Weber', { roles: ['player', 'trainer'] })

    const before = auditService.listRecent().length
    memberAdminService.setRoles(tom, ['trainer', 'player'], admin)
    const after = auditService.listRecent().length
    expect(after).toBe(before)
  })

  it('wirft MustKeepPlayerRoleError wenn player entfernt wird', () => {
    const admin = insertMember('Anna', 'Admin', { roles: ['admin', 'player'] })
    const tom = insertMember('Tom', 'Weber')

    expect(() =>
      memberAdminService.setRoles(tom, ['trainer'] as Role[], admin),
    ).toThrow(MustKeepPlayerRoleError)
  })

  it('wirft CannotRemoveLastAdminError beim Lock-out', () => {
    // Nur ein Admin im System
    const admin = insertMember('Anna', 'Admin', { roles: ['admin', 'player'] })

    expect(() =>
      memberAdminService.setRoles(admin, ['player'], admin),
    ).toThrow(CannotRemoveLastAdminError)
  })

  it('erlaubt Admin-Entzug, wenn weiterer aktiver Admin existiert', () => {
    const a1 = insertMember('Anna', 'Admin', { roles: ['admin', 'player'] })
    const a2 = insertMember('Boris', 'Backup', { roles: ['admin', 'player'] })

    const updated = memberAdminService.setRoles(a1, ['player'], a2)
    expect(updated.roles).toEqual(['player'])
  })

  it('zaehlt deaktivierte Admins nicht zum Lock-out-Schutz', () => {
    const a1 = insertMember('Anna', 'Admin', { roles: ['admin', 'player'] })
    // Zweiter Admin existiert, ist aber deaktiviert
    insertMember('Boris', 'Backup', {
      roles: ['admin', 'player'],
      deactivated: true,
    })

    expect(() => memberAdminService.setRoles(a1, ['player'], a1)).toThrow(
      CannotRemoveLastAdminError,
    )
  })

  it('wirft NotFound bei unbekannter Member-ID', () => {
    const admin = insertMember('Anna', 'Admin', { roles: ['admin', 'player'] })
    expect(() =>
      memberAdminService.setRoles(
        'unknown-member-id' as MemberId,
        ['player'],
        admin,
      ),
    ).toThrow(MemberNotFoundError)
  })

  it('entfernt Duplikate aus dem rolles-Input', () => {
    const admin = insertMember('Anna', 'Admin', { roles: ['admin', 'player'] })
    const tom = insertMember('Tom', 'Weber')
    const updated = memberAdminService.setRoles(
      tom,
      ['player', 'trainer', 'trainer'] as Role[],
      admin,
    )
    expect(updated.roles.length).toBe(2)
    expect(updated.roles.sort()).toEqual(['player', 'trainer'])
  })
})

describe('memberAdminService.create', () => {
  it('legt ein Mitglied mit Default-Rolle player an und schreibt Audit', () => {
    const admin = insertMember('Anna', 'Admin', { roles: ['admin', 'player'] })

    const m = memberAdminService.create(
      {
        firstName: 'Neu',
        lastName: 'Spieler',
        birthYear: 1995,
        gender: 'm',
        email: 'neu@example.de',
        dtbLk: 12.5,
      },
      admin,
    )

    expect(m.id).toBeTruthy()
    expect(m.firstName).toBe('Neu')
    expect(m.lastName).toBe('Spieler')
    expect(m.email).toBe('neu@example.de')
    expect(m.dtbLk).toBe(12.5)
    expect(m.roles).toEqual(['player'])
    expect(m.status).toBe('aktiv')
    expect(m.deactivatedAt).toBeNull()
    expect(m.invitedAt).toBeNull()
    expect(m.firstLoginAt).toBeNull()

    const audits = auditService.listRecent()
    expect(audits[0]?.action).toBe('member.created')
    expect(audits[0]?.subjectId).toBe(m.id)
    expect(audits[0]?.after).toMatchObject({ email: 'neu@example.de' })
  })

  it('wirft Duplicate-Email bei case-insensitiver Kollision', () => {
    const admin = insertMember('Anna', 'Admin', { roles: ['admin', 'player'] })
    memberAdminService.create(
      {
        firstName: 'Erste',
        lastName: 'Person',
        birthYear: 1990,
        gender: 'w',
        email: 'kollision@example.de',
        dtbLk: 10,
      },
      admin,
    )
    expect(() =>
      memberAdminService.create(
        {
          firstName: 'Zweite',
          lastName: 'Person',
          birthYear: 1991,
          gender: 'w',
          email: 'KOLLISION@example.de',
          dtbLk: 11,
        },
        admin,
      ),
    ).toThrow(MemberDuplicateEmailError)
  })

  it('trimmt Whitespace in Vor- und Nachname', () => {
    const admin = insertMember('Anna', 'Admin', { roles: ['admin', 'player'] })
    const m = memberAdminService.create(
      {
        firstName: '  Max  ',
        lastName: '  Müller ',
        birthYear: 1985,
        gender: 'm',
        email: 'max.mueller@example.de',
        dtbLk: 9,
      },
      admin,
    )
    expect(m.firstName).toBe('Max')
    expect(m.lastName).toBe('Müller')
  })
})
