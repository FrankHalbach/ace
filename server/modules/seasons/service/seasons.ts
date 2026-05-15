import { ageGroupRepo } from '../repository/age-group-repo'
import { seasonRepo } from '../repository/season-repo'
import {
  AgeGroupNameTakenError,
  AgeGroupNotFoundError,
  SeasonFrozenError,
  SeasonInvalidTransitionError,
  SeasonNameTakenError,
  SeasonNotFoundError,
  type AgeGroupDto,
  type AgeGroupId,
  type CreateAgeGroupInput,
  type CreateSeasonInput,
  type SeasonDetailDto,
  type SeasonDto,
  type SeasonId,
  type UpdateAgeGroupInput,
  type UpdateSeasonInput,
} from '../types'
import type { AgeGroupRow } from '../../../db/schema/age-group'
import type { SeasonRow, SeasonStatus } from '../../../db/schema/season'

function seasonToDto(row: SeasonRow): SeasonDto {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    startedAt: row.startedAt,
    closedAt: row.closedAt,
    archivedAt: row.archivedAt,
    config: row.config,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function ageGroupToDto(row: AgeGroupRow): AgeGroupDto {
  return {
    id: row.id,
    seasonId: row.seasonId,
    name: row.name,
    minAge: row.minAge,
    maxAge: row.maxAge,
    genderRule: row.genderRule,
    active: row.active,
  }
}

/** Helper: lädt eine Saison oder wirft `SeasonNotFoundError`. */
function loadSeason(id: SeasonId): SeasonRow {
  const row = seasonRepo.findById(id)
  if (!row) throw new SeasonNotFoundError(id)
  return row
}

function assertPlanned(row: SeasonRow): void {
  if (row.status !== 'PLANNED') {
    throw new SeasonFrozenError(row.id, row.status)
  }
}

export const seasonsService = {
  // --- Season CRUD --------------------------------------------------------

  list(): SeasonDto[] {
    return seasonRepo.list().map(seasonToDto)
  },

  getDetail(id: SeasonId): SeasonDetailDto {
    const row = loadSeason(id)
    const ageGroups = ageGroupRepo.listBySeason(id).map(ageGroupToDto)
    return { ...seasonToDto(row), ageGroups }
  },

  create(input: CreateSeasonInput): SeasonDto {
    if (seasonRepo.findByName(input.name)) {
      throw new SeasonNameTakenError(input.name)
    }
    const row = seasonRepo.insert({ name: input.name })
    return seasonToDto(row)
  },

  update(id: SeasonId, input: UpdateSeasonInput): SeasonDto {
    const row = loadSeason(id)
    assertPlanned(row)

    if (input.name && input.name !== row.name) {
      if (seasonRepo.findByName(input.name)) {
        throw new SeasonNameTakenError(input.name)
      }
    }

    const updated = seasonRepo.updateById(id, input)
    return seasonToDto(updated!)
  },

  delete(id: SeasonId): void {
    const row = loadSeason(id)
    assertPlanned(row)
    seasonRepo.deleteById(id)
  },

  // --- Lifecycle ----------------------------------------------------------

  /**
   * Pure Status-Transition. Side-Effects (z. B. Ranglisten erzeugen) gehören
   * in den API-Handler — der orchestriert Cross-Modul-Aufrufe.
   */
  start(id: SeasonId): SeasonDto {
    return transition(id, 'PLANNED', 'ACTIVE', { startedAt: new Date() })
  },

  close(id: SeasonId): SeasonDto {
    return transition(id, 'ACTIVE', 'CLOSED', { closedAt: new Date() })
  },

  archive(id: SeasonId): SeasonDto {
    return transition(id, 'CLOSED', 'ARCHIVED', { archivedAt: new Date() })
  },

  // --- AgeGroups ----------------------------------------------------------

  addAgeGroup(seasonId: SeasonId, input: CreateAgeGroupInput): AgeGroupDto {
    const row = loadSeason(seasonId)
    assertPlanned(row)
    if (ageGroupRepo.findByName(seasonId, input.name)) {
      throw new AgeGroupNameTakenError(seasonId, input.name)
    }
    const inserted = ageGroupRepo.insert({
      seasonId,
      name: input.name,
      minAge: input.minAge,
      maxAge: input.maxAge,
      genderRule: input.genderRule,
      active: input.active,
    })
    return ageGroupToDto(inserted)
  },

  updateAgeGroup(id: AgeGroupId, input: UpdateAgeGroupInput): AgeGroupDto {
    const existing = ageGroupRepo.findById(id)
    if (!existing) throw new AgeGroupNotFoundError(id)
    const parent = loadSeason(existing.seasonId)
    assertPlanned(parent)

    if (input.name && input.name !== existing.name) {
      if (ageGroupRepo.findByName(existing.seasonId, input.name)) {
        throw new AgeGroupNameTakenError(existing.seasonId, input.name)
      }
    }
    const updated = ageGroupRepo.updateById(id, input)
    return ageGroupToDto(updated!)
  },

  deleteAgeGroup(id: AgeGroupId): void {
    const existing = ageGroupRepo.findById(id)
    if (!existing) throw new AgeGroupNotFoundError(id)
    const parent = loadSeason(existing.seasonId)
    assertPlanned(parent)
    ageGroupRepo.deleteById(id)
  },
}

function transition(
  id: SeasonId,
  from: SeasonStatus,
  to: SeasonStatus,
  patch: Partial<SeasonRow>,
): SeasonDto {
  loadSeason(id) // sicherstellen, dass die Saison existiert
  const updated = seasonRepo.transitionStatus(id, from, { status: to, ...patch })
  if (!updated) {
    const row = loadSeason(id)
    throw new SeasonInvalidTransitionError(row.status, to)
  }
  return seasonToDto(updated)
}
