import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { teamTag } from '../../server/db/schema/team-tag'
import { auditEntry, type AuditEntryId } from '../../server/db/schema/audit-entry'
import { auditService, InvalidAuditCursorError } from '../../server/modules/admin'
import type { MemberId } from '../../server/modules/members'
import { newPublicId } from '../../server/shared/public-id'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

function insertMember(firstName: string, lastName: string): MemberId {
  const row = useDb()
    .insert(member)
    .values({
      email: `${firstName}.${lastName}@x.de`.toLowerCase(),
      firstName,
      lastName,
      birthYear: 1990,
      gender: 'm',
      dtbLk: 10,
      roles: ['player'],
    })
    .returning()
    .get()
  return row!.id
}

function insertTeamTag(name: string): string {
  const row = useDb()
    .insert(teamTag)
    .values({ name, sortOrder: 0, active: true })
    .returning()
    .get()
  return row!.id
}

describe('auditService.listFiltered — filter', () => {
  it('liefert alle Einträge ohne Filter, jüngste zuerst', async () => {
    const actor = insertMember('Anna', 'Admin')
    auditService.log({ actorId: actor, action: 'member.imported', note: 'first' })
    await new Promise((r) => setTimeout(r, 1100))
    auditService.log({ actorId: actor, action: 'member.imported', note: 'second' })

    const page = auditService.listFiltered({ limit: 50 })
    expect(page.entries).toHaveLength(2)
    expect(page.entries[0]!.note).toBe('second')
    expect(page.entries[1]!.note).toBe('first')
    expect(page.nextCursor).toBeNull()
  })

  it('filtert nach action', () => {
    const actor = insertMember('Anna', 'Admin')
    auditService.log({ actorId: actor, action: 'member.imported', note: 'i' })
    auditService.log({ actorId: actor, action: 'member.invited', note: 'inv' })

    const page = auditService.listFiltered({ action: 'member.invited', limit: 50 })
    expect(page.entries).toHaveLength(1)
    expect(page.entries[0]!.action).toBe('member.invited')
  })

  it('filtert nach actorId', () => {
    const actor1 = insertMember('Anna', 'Admin')
    const actor2 = insertMember('Boris', 'Backup')
    auditService.log({ actorId: actor1, action: 'member.imported', note: 'a1' })
    auditService.log({ actorId: actor2, action: 'member.imported', note: 'a2' })

    const page = auditService.listFiltered({ actorId: actor2, limit: 50 })
    expect(page.entries).toHaveLength(1)
    expect(page.entries[0]!.note).toBe('a2')
  })

  it('filtert nach subjectKind und subjectId', () => {
    const actor = insertMember('Anna', 'Admin')
    const target1 = insertMember('Tom', 'One')
    const target2 = insertMember('Tom', 'Two')
    auditService.log({
      actorId: actor,
      action: 'member.role-changed',
      subjectKind: 'member',
      subjectId: target1,
    })
    auditService.log({
      actorId: actor,
      action: 'member.role-changed',
      subjectKind: 'member',
      subjectId: target2,
    })

    const page = auditService.listFiltered({
      subjectKind: 'member',
      subjectId: target2,
      limit: 50,
    })
    expect(page.entries).toHaveLength(1)
    expect(page.entries[0]!.subjectId).toBe(target2)
  })

  it('filtert nach from/to-Zeitraum', async () => {
    const actor = insertMember('Anna', 'Admin')
    auditService.log({ actorId: actor, action: 'member.imported', note: 'before' })
    await new Promise((r) => setTimeout(r, 1100))
    const mid = new Date()
    await new Promise((r) => setTimeout(r, 1100))
    auditService.log({ actorId: actor, action: 'member.imported', note: 'after' })

    const onlyAfter = auditService.listFiltered({ from: mid, limit: 50 })
    expect(onlyAfter.entries).toHaveLength(1)
    expect(onlyAfter.entries[0]!.note).toBe('after')

    const onlyBefore = auditService.listFiltered({ to: mid, limit: 50 })
    expect(onlyBefore.entries).toHaveLength(1)
    expect(onlyBefore.entries[0]!.note).toBe('before')
  })
})

describe('auditService.listFiltered — subject label resolution', () => {
  it('löst member-subject zu "Vorname Nachname" auf', () => {
    const actor = insertMember('Anna', 'Admin')
    const target = insertMember('Tom', 'Weber')
    auditService.log({
      actorId: actor,
      action: 'member.lk-corrected',
      subjectKind: 'member',
      subjectId: target,
    })

    const page = auditService.listFiltered({ limit: 50 })
    expect(page.entries[0]!.subjectLabel).toBe('Tom Weber')
    expect(page.entries[0]!.actor.firstName).toBe('Anna')
    expect(page.entries[0]!.actor.lastName).toBe('Admin')
  })

  it('löst team-tag-subject zum Tag-Namen auf', () => {
    const actor = insertMember('Anna', 'Admin')
    const tagId = insertTeamTag('1. Herren')
    auditService.log({
      actorId: actor,
      action: 'team-tag.renamed',
      subjectKind: 'team-tag',
      subjectId: tagId,
    })

    const page = auditService.listFiltered({ limit: 50 })
    expect(page.entries[0]!.subjectLabel).toBe('1. Herren')
  })

  it('verwendet kurzes Fallback-Label für challenge/friendly/result', () => {
    const actor = insertMember('Anna', 'Admin')
    auditService.log({
      actorId: actor,
      action: 'challenge.cancelled-by-trainer',
      subjectKind: 'challenge',
      subjectId: 'chal_abcdef1234',
    })

    const page = auditService.listFiltered({ limit: 50 })
    expect(page.entries[0]!.subjectLabel).toBe('#ef1234')
  })

  it('liefert null als subjectLabel, wenn kein Subject gesetzt ist', () => {
    const actor = insertMember('Anna', 'Admin')
    auditService.log({ actorId: actor, action: 'member.imported', note: 'bulk' })

    const page = auditService.listFiltered({ limit: 50 })
    expect(page.entries[0]!.subjectLabel).toBeNull()
    expect(page.entries[0]!.subjectKind).toBeNull()
  })
})

describe('auditService.listFiltered — cursor pagination', () => {
  /**
   * Direkter DB-Insert mit kontrolliertem `createdAt` — die Default-
   * `unixepoch()` hat nur Sekunden-Granularität, was den Sleep-Trick
   * langsam und flaky machen würde. Sortier-Order-Tests brauchen exakte
   * Timestamps.
   */
  function insertEntryAt(actorId: MemberId, note: string, createdAt: Date): void {
    useDb()
      .insert(auditEntry)
      .values({
        id: newPublicId() as AuditEntryId,
        actorId,
        action: 'member.imported',
        subjectKind: null,
        subjectId: null,
        before: null,
        after: null,
        note,
        createdAt,
      })
      .run()
  }

  it('liefert nextCursor, wenn mehr Einträge da sind als limit', () => {
    const actor = insertMember('Anna', 'Admin')
    const base = new Date('2026-05-20T10:00:00Z')
    for (let i = 0; i < 5; i++) {
      insertEntryAt(actor, `entry-${i}`, new Date(base.getTime() + i * 60_000))
    }

    const page1 = auditService.listFiltered({ limit: 2 })
    expect(page1.entries).toHaveLength(2)
    expect(page1.entries[0]!.note).toBe('entry-4')
    expect(page1.entries[1]!.note).toBe('entry-3')
    expect(page1.nextCursor).not.toBeNull()

    const page2 = auditService.listFiltered({ limit: 2, cursor: page1.nextCursor! })
    expect(page2.entries).toHaveLength(2)
    expect(page2.entries[0]!.note).toBe('entry-2')
    expect(page2.entries[1]!.note).toBe('entry-1')

    const page3 = auditService.listFiltered({ limit: 2, cursor: page2.nextCursor! })
    expect(page3.entries).toHaveLength(1)
    expect(page3.entries[0]!.note).toBe('entry-0')
    expect(page3.nextCursor).toBeNull()
  })

  it('paginiert deterministisch bei gleichem createdAt via id-Tiebreaker', () => {
    const actor = insertMember('Anna', 'Admin')
    const sameMoment = new Date('2026-05-20T10:00:00Z')
    for (let i = 0; i < 3; i++) {
      insertEntryAt(actor, `same-${i}`, sameMoment)
    }

    const page1 = auditService.listFiltered({ limit: 2 })
    const page2 = auditService.listFiltered({ limit: 2, cursor: page1.nextCursor! })
    expect(page1.entries).toHaveLength(2)
    expect(page2.entries).toHaveLength(1)

    // Kein Eintrag taucht doppelt auf
    const allIds = [...page1.entries, ...page2.entries].map((e) => e.id)
    expect(new Set(allIds).size).toBe(3)
  })

  it('wirft InvalidAuditCursorError bei kaputtem Token', () => {
    expect(() => auditService.listFiltered({ limit: 10, cursor: 'not-a-cursor!' }))
      .toThrowError(InvalidAuditCursorError)
  })
})
