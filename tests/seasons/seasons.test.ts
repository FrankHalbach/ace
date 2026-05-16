import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  AgeGroupNameTakenError,
  AgeGroupNotFoundError,
  SeasonFrozenError,
  SeasonInvalidTransitionError,
  SeasonNameTakenError,
  SeasonNotFoundError,
  seasonsService,
  type SeasonId,
} from '../../server/modules/seasons'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

describe('seasonsService', () => {
  describe('Saison-CRUD', () => {
    it('legt eine Saison im Status PLANNED an', () => {
      const s = seasonsService.create({ name: 'Sommer 2026' })
      expect(s.name).toBe('Sommer 2026')
      expect(s.status).toBe('PLANNED')
      expect(s.startedAt).toBeNull()
    })

    it('weist doppelten Saison-Namen ab', () => {
      seasonsService.create({ name: 'Sommer 2026' })
      expect(() => seasonsService.create({ name: 'Sommer 2026' })).toThrow(SeasonNameTakenError)
    })

    it('listet Saisons in Anlage-Reihenfolge', () => {
      seasonsService.create({ name: 'Winter 2025' })
      seasonsService.create({ name: 'Sommer 2026' })
      const list = seasonsService.list()
      expect(list.map((s) => s.name)).toEqual(['Winter 2025', 'Sommer 2026'])
    })

    it('update ändert Name, getDetail liefert Detail inkl. ageGroups', () => {
      const s = seasonsService.create({ name: 'Sommer 2026' })
      seasonsService.update(s.id, { name: 'Sommer 2026 — Saison 1' })
      const detail = seasonsService.getDetail(s.id)
      expect(detail.name).toBe('Sommer 2026 — Saison 1')
      expect(detail.ageGroups).toEqual([])
    })

    it('update wirft bei unbekannter ID', () => {
      expect(() => seasonsService.update(999 as SeasonId, { name: 'X' })).toThrow(SeasonNotFoundError)
    })

    it('delete cascadet AgeGroups', () => {
      const s = seasonsService.create({ name: 'Sommer 2026' })
      seasonsService.addAgeGroup(s.id, {
        name: 'Aktive',
        minAge: 18,
        maxAge: null,
        gender: 'm',
        active: true,
      })
      seasonsService.delete(s.id)
      expect(() => seasonsService.getDetail(s.id)).toThrow(SeasonNotFoundError)
    })
  })

  describe('Lifecycle', () => {
    it('PLANNED → ACTIVE → CLOSED → ARCHIVED', () => {
      const s = seasonsService.create({ name: 'Sommer 2026' })
      const active = seasonsService.start(s.id)
      expect(active.status).toBe('ACTIVE')
      expect(active.startedAt).toBeInstanceOf(Date)

      const closed = seasonsService.close(s.id)
      expect(closed.status).toBe('CLOSED')

      const archived = seasonsService.archive(s.id)
      expect(archived.status).toBe('ARCHIVED')
    })

    it('verbietet Rückwärts-Transition', () => {
      const s = seasonsService.create({ name: 'Sommer 2026' })
      seasonsService.start(s.id)
      expect(() => seasonsService.start(s.id)).toThrow(SeasonInvalidTransitionError)
    })

    it('verbietet Sprünge über Status', () => {
      const s = seasonsService.create({ name: 'Sommer 2026' })
      expect(() => seasonsService.close(s.id)).toThrow(SeasonInvalidTransitionError)
      expect(() => seasonsService.archive(s.id)).toThrow(SeasonInvalidTransitionError)
    })

    it('verbietet Edits nach Start', () => {
      const s = seasonsService.create({ name: 'Sommer 2026' })
      seasonsService.start(s.id)
      expect(() => seasonsService.update(s.id, { name: 'X' })).toThrow(SeasonFrozenError)
      expect(() => seasonsService.delete(s.id)).toThrow(SeasonFrozenError)
    })
  })

  describe('AgeGroups', () => {
    it('legt AgeGroup an mit allen Feldern', () => {
      const s = seasonsService.create({ name: 'Sommer 2026' })
      const ag = seasonsService.addAgeGroup(s.id, {
        name: 'U15',
        minAge: 13,
        maxAge: 14,
        gender: 'mixed',
        active: true,
      })
      expect(ag.name).toBe('U15')
      expect(ag.gender).toBe('mixed')
    })

    it('AgeGroup-Listing über getDetail', () => {
      const s = seasonsService.create({ name: 'Sommer 2026' })
      seasonsService.addAgeGroup(s.id, { name: 'U15', minAge: 13, maxAge: 14, gender: 'mixed', active: true })
      seasonsService.addAgeGroup(s.id, { name: 'Aktive', minAge: 18, maxAge: null, gender: 'm', active: true })
      const detail = seasonsService.getDetail(s.id)
      expect(detail.ageGroups).toHaveLength(2)
    })

    it('verhindert doppelten Namen innerhalb derselben Saison', () => {
      const s = seasonsService.create({ name: 'Sommer 2026' })
      seasonsService.addAgeGroup(s.id, { name: 'U15', minAge: 13, maxAge: 14, gender: 'mixed', active: true })
      expect(() =>
        seasonsService.addAgeGroup(s.id, { name: 'U15', minAge: 13, maxAge: 14, gender: 'mixed', active: true }),
      ).toThrow(AgeGroupNameTakenError)
    })

    it('erlaubt gleichen Namen in unterschiedlichen Saisons', () => {
      const a = seasonsService.create({ name: 'Sommer 2025' })
      const b = seasonsService.create({ name: 'Sommer 2026' })
      seasonsService.addAgeGroup(a.id, { name: 'U15', minAge: 13, maxAge: 14, gender: 'mixed', active: true })
      expect(() =>
        seasonsService.addAgeGroup(b.id, { name: 'U15', minAge: 13, maxAge: 14, gender: 'mixed', active: true }),
      ).not.toThrow()
    })

    it('Update und Delete blockiert nach Saison-Start', () => {
      const s = seasonsService.create({ name: 'Sommer 2026' })
      const ag = seasonsService.addAgeGroup(s.id, {
        name: 'U15',
        minAge: 13,
        maxAge: 14,
        gender: 'mixed',
        active: true,
      })
      seasonsService.start(s.id)

      expect(() => seasonsService.updateAgeGroup(ag.id, { name: 'U16' })).toThrow(SeasonFrozenError)
      expect(() => seasonsService.deleteAgeGroup(ag.id)).toThrow(SeasonFrozenError)
    })

    it('updateAgeGroup wirft bei unbekannter ID', () => {
      expect(() => seasonsService.updateAgeGroup(999 as never, { name: 'X' })).toThrow(AgeGroupNotFoundError)
    })

    it('AgeGroup-Hinzufügen blockiert nach Saison-Start', () => {
      const s = seasonsService.create({ name: 'Sommer 2026' })
      seasonsService.start(s.id)
      expect(() =>
        seasonsService.addAgeGroup(s.id, { name: 'U15', minAge: 13, maxAge: 14, gender: 'mixed', active: true }),
      ).toThrow(SeasonFrozenError)
    })
  })
})
