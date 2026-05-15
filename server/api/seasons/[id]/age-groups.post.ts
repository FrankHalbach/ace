import {
  AgeGroupNameTakenError,
  createAgeGroupInput,
  SeasonFrozenError,
  SeasonNotFoundError,
  seasonsService,
  type SeasonId,
} from '../../../modules/seasons'
import { requireIntParam, requireRole } from '../../../shared/require-role'

/** POST /api/seasons/:id/age-groups — Admin, nur im Status PLANNED */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')
  const seasonId = requireIntParam(event, 'id') as SeasonId
  const body = await readValidatedBody(event, createAgeGroupInput.parse)

  try {
    return seasonsService.addAgeGroup(seasonId, body)
  } catch (err) {
    if (err instanceof SeasonNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'season.not-found' })
    }
    if (err instanceof SeasonFrozenError) {
      throw createError({ statusCode: 409, statusMessage: 'season.frozen' })
    }
    if (err instanceof AgeGroupNameTakenError) {
      throw createError({ statusCode: 409, statusMessage: 'age-group.name-taken' })
    }
    throw err
  }
})
