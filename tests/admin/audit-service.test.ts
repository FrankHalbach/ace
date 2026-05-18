import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { auditService } from '../../server/modules/admin'
import type { MemberId } from '../../server/modules/members'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

function insertMember(suffix: string): MemberId {
  const row = useDb()
    .insert(member)
    .values({
      email: `audit-${suffix}@x.de`,
      firstName: 'Audit',
      lastName: suffix,
      birthYear: 1990,
      gender: 'm',
      dtbLk: 10,
      roles: ['admin'],
    })
    .returning()
    .get()
  return row!.id
}

describe('auditService.log', () => {
  it('schreibt einen Eintrag mit minimalen Feldern', () => {
    const actor = insertMember('A')
    const subject = insertMember('B')

    const entry = auditService.log({
      actorId: actor,
      action: 'member.role-changed',
      subjectKind: 'member',
      subjectId: subject,
      before: { roles: ['player'] },
      after: { roles: ['player', 'trainer'] },
    })

    expect(entry.id).toBeTruthy()
    expect(entry.actorId).toBe(actor)
    expect(entry.action).toBe('member.role-changed')
    expect(entry.subjectKind).toBe('member')
    expect(entry.subjectId).toBe(subject)
    expect(entry.before).toEqual({ roles: ['player'] })
    expect(entry.after).toEqual({ roles: ['player', 'trainer'] })
    expect(entry.note).toBeNull()
    expect(entry.createdAt).toBeInstanceOf(Date)
  })

  it('erlaubt Action ohne Subject und ohne Diff (z. B. CSV-Import)', () => {
    const actor = insertMember('A')

    const entry = auditService.log({
      actorId: actor,
      action: 'member.imported',
      note: '3 Mitglieder importiert, 1 übersprungen',
    })

    expect(entry.subjectKind).toBeNull()
    expect(entry.subjectId).toBeNull()
    expect(entry.before).toBeNull()
    expect(entry.after).toBeNull()
    expect(entry.note).toBe('3 Mitglieder importiert, 1 übersprungen')
  })

  it('listet jüngste Einträge zuerst', async () => {
    const actor = insertMember('A')
    auditService.log({ actorId: actor, action: 'member.imported', note: 'first' })
    await new Promise((r) => setTimeout(r, 1100)) // unixepoch() hat Sekunden-Auflösung
    auditService.log({ actorId: actor, action: 'member.imported', note: 'second' })

    const recent = auditService.listRecent()
    expect(recent[0]?.note).toBe('second')
    expect(recent[1]?.note).toBe('first')
  })
})
