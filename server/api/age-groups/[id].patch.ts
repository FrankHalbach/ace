import {
  AgeGroupNameTakenError,
  AgeGroupNotFoundError,
  SeasonFrozenError,
  seasonsService,
  updateAgeGroupInput,
  type AgeGroupId,
} from '../../modules/seasons'
import { requireIntParam, requireRole } from '../../shared/require-role'

/** PATCH /api/age-groups/:id — Admin, nur wenn Parent-Season PLANNED */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')
  const id = requireIntParam(event, 'id') as AgeGroupId
  const body = await readValidatedBody(event, updateAgeGroupInput.parse)

  try {
    return seasonsService.updateAgeGroup(id, body)
  } catch (err) {
    if (err instanceof AgeGroupNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'age-group.not-found' })
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
