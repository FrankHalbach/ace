import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { auditService } from '../../server/modules/admin'
import type { MemberId } from '../../server/modules/members'
import {
  TeamTagDuplicateNameError,
  TeamTagInactiveError,
  TeamTagNotFoundError,
  teamTagsService,
  type TeamTagId,
} from '../../server/modules/team-tags'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

function insertMember(suffix: string): MemberId {
  const row = useDb()
    .insert(member)
    .values({
      email: `tt-${suffix}@x.de`,
      firstName: 'T',
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

describe('teamTagsService', () => {
  describe('create', () => {
    it('legt einen Tag an und schreibt einen Audit-Eintrag', () => {
      const actor = insertMember('A')
      const tag = teamTagsService.create(
        { name: '1. Herren' },
        actor,
      )
      expect(tag.name).toBe('1. Herren')
      expect(tag.active).toBe(true)
      expect(tag.sortOrder).toBe(0)

      const audit = auditService.listRecent()
      expect(audit[0]?.action).toBe('team-tag.created')
      expect(audit[0]?.subjectId).toBe(tag.id)
    })

    it('verweigert Duplikat (case-insensitive)', () => {
      const actor = insertMember('A')
      teamTagsService.create({ name: '1. Herren' }, actor)
      expect(() =>
        teamTagsService.create({ name: '1. herren' }, actor),
      ).toThrow(TeamTagDuplicateNameError)
    })

    it('trimmt Whitespace im Namen', () => {
      const actor = insertMember('A')
      const tag = teamTagsService.create(
        { name: '  Damen 30  ' },
        actor,
      )
      expect(tag.name).toBe('Damen 30')
    })
  })

  describe('update', () => {
    it('benennt um und schreibt Audit nur bei Name-Aenderung', () => {
      const actor = insertMember('A')
      const tag = teamTagsService.create({ name: 'Herren A' }, actor)

      teamTagsService.update(tag.id, { sortOrder: 5 }, actor)
      let audits = auditService
        .listRecent()
        .filter((a) => a.action === 'team-tag.renamed')
      expect(audits.length).toBe(0)

      teamTagsService.update(tag.id, { name: 'Herren 1' }, actor)
      audits = auditService
        .listRecent()
        .filter((a) => a.action === 'team-tag.renamed')
      expect(audits.length).toBe(1)
      expect(audits[0]?.before).toEqual({ name: 'Herren A' })
      expect(audits[0]?.after).toEqual({ name: 'Herren 1' })
    })

    it('archivieren via active=false', () => {
      const actor = insertMember('A')
      const tag = teamTagsService.create({ name: 'Alte Truppe' }, actor)
      const updated = teamTagsService.update(
        tag.id,
        { active: false },
        actor,
      )
      expect(updated.active).toBe(false)
    })

    it('lehnt Umbenennung auf existierenden Namen ab', () => {
      const actor = insertMember('A')
      teamTagsService.create({ name: 'Herren 1' }, actor)
      const b = teamTagsService.create({ name: 'Herren 2' }, actor)
      expect(() =>
        teamTagsService.update(b.id, { name: 'herren 1' }, actor),
      ).toThrow(TeamTagDuplicateNameError)
    })

    it('wirft NotFound bei unbekannter ID', () => {
      const actor = insertMember('A')
      expect(() =>
        teamTagsService.update(
          'unknown-tag-id' as TeamTagId,
          { name: 'x' },
          actor,
        ),
      ).toThrow(TeamTagNotFoundError)
    })
  })

  describe('delete', () => {
    it('loescht Tag und schreibt Audit', () => {
      const actor = insertMember('A')
      const tag = teamTagsService.create({ name: 'Junioren' }, actor)
      teamTagsService.delete(tag.id, actor)

      expect(teamTagsService.listAll()).toHaveLength(0)

      const audits = auditService
        .listRecent()
        .filter((a) => a.action === 'team-tag.deleted')
      expect(audits.length).toBe(1)
      expect(audits[0]?.before).toMatchObject({ name: 'Junioren' })
    })

    it('CASCADE entfernt member_team_tag-Zuweisungen', () => {
      const actor = insertMember('A')
      const player = insertMember('B')
      const tag = teamTagsService.create({ name: '1. Damen' }, actor)
      teamTagsService.setAssignments({
        memberId: player,
        tagIds: [tag.id],
        assignedBy: actor,
      })
      expect(teamTagsService.listForMember(player)).toHaveLength(1)

      teamTagsService.delete(tag.id, actor)
      expect(teamTagsService.listForMember(player)).toHaveLength(0)
    })
  })

  describe('setAssignments', () => {
    it('setzt Tag-Liste atomar und schreibt einen Audit', () => {
      const actor = insertMember('A')
      const player = insertMember('B')
      const a = teamTagsService.create({ name: '1. Herren' }, actor)
      const b = teamTagsService.create({ name: 'Bezirksliga' }, actor)

      teamTagsService.setAssignments({
        memberId: player,
        tagIds: [a.id, b.id],
        assignedBy: actor,
      })
      const after = teamTagsService.listForMember(player)
      expect(after.map((t) => t.id).sort()).toEqual([a.id, b.id].sort())

      const audits = auditService
        .listRecent()
        .filter((a) => a.action === 'member.team-tags-changed')
      expect(audits.length).toBe(1)
    })

    it('schreibt keinen Audit, wenn sich die Tag-Liste nicht aendert', () => {
      const actor = insertMember('A')
      const player = insertMember('B')
      const a = teamTagsService.create({ name: '1. Herren' }, actor)
      teamTagsService.setAssignments({
        memberId: player,
        tagIds: [a.id],
        assignedBy: actor,
      })
      teamTagsService.setAssignments({
        memberId: player,
        tagIds: [a.id],
        assignedBy: actor,
      })
      const audits = auditService
        .listRecent()
        .filter((a) => a.action === 'member.team-tags-changed')
      expect(audits.length).toBe(1)
    })

    it('lehnt inaktive Tags fuer neue Zuweisung ab', () => {
      const actor = insertMember('A')
      const player = insertMember('B')
      const tag = teamTagsService.create({ name: 'Archiv' }, actor)
      teamTagsService.update(tag.id, { active: false }, actor)

      expect(() =>
        teamTagsService.setAssignments({
          memberId: player,
          tagIds: [tag.id],
          assignedBy: actor,
        }),
      ).toThrow(TeamTagInactiveError)
    })

    it('belaesst bereits zugewiesenen inaktiven Tag bestehen', () => {
      const actor = insertMember('A')
      const player = insertMember('B')
      const tag = teamTagsService.create({ name: 'Geht-bald-weg' }, actor)
      teamTagsService.setAssignments({
        memberId: player,
        tagIds: [tag.id],
        assignedBy: actor,
      })
      teamTagsService.update(tag.id, { active: false }, actor)

      // Tag bleibt zugewiesen — UI kann ihn anzeigen, neue Zuweisung gleichzeitig
      // mit weiteren aktiven Tags ist okay solange der inaktive bereits dran haengt
      teamTagsService.setAssignments({
        memberId: player,
        tagIds: [tag.id],
        assignedBy: actor,
      })
      expect(teamTagsService.listForMember(player)).toHaveLength(1)
    })

    it('Duplikate in tagIds werden entfernt', () => {
      const actor = insertMember('A')
      const player = insertMember('B')
      const tag = teamTagsService.create({ name: 'Once' }, actor)
      teamTagsService.setAssignments({
        memberId: player,
        tagIds: [tag.id, tag.id, tag.id],
        assignedBy: actor,
      })
      expect(teamTagsService.listForMember(player)).toHaveLength(1)
    })
  })

  describe('listAll', () => {
    it('sortiert nach sortOrder dann Name', () => {
      const actor = insertMember('A')
      teamTagsService.create({ name: 'Beta', sortOrder: 2 }, actor)
      teamTagsService.create({ name: 'Alpha', sortOrder: 2 }, actor)
      teamTagsService.create({ name: 'Gamma', sortOrder: 1 }, actor)

      const all = teamTagsService.listAll()
      expect(all.map((t) => t.name)).toEqual(['Gamma', 'Alpha', 'Beta'])
    })
  })
})
