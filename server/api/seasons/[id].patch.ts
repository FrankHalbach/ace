import {
  SeasonFrozenError,
  SeasonNameTakenError,
  SeasonNotFoundError,
  seasonsService,
  updateSeasonInput,
  type SeasonId,
} from '../../modules/seasons'
import { requireIntParam, requireRole } from '../../shared/require-role'

/**
 * PATCH /api/seasons/:id — Admin-only, nur im Status PLANNED erlaubt.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')

  const id = requireIntParam(event, 'id') as SeasonId
  const body = await readValidatedBody(event, updateSeasonInput.parse)
  try {
    return seasonsService.update(id, body)
  } catch (err) {
    if (err instanceof SeasonNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'season.not-found' })
    }
    if (err instanceof SeasonFrozenError) {
      throw createError({ statusCode: 409, statusMessage: 'season.frozen' })
    }
    if (err instanceof SeasonNameTakenError) {
      throw createError({ statusCode: 409, statusMessage: 'season.name-taken' })
    }
    throw err
  }
})
