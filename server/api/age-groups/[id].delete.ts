import {
  AgeGroupNotFoundError,
  SeasonFrozenError,
  seasonsService,
  type AgeGroupId,
} from '../../modules/seasons'
import { requireIntParam, requireRole } from '../../shared/require-role'

/** DELETE /api/age-groups/:id — Admin, nur wenn Parent-Season PLANNED */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')
  const id = requireIntParam(event, 'id') as AgeGroupId

  try {
    seasonsService.deleteAgeGroup(id)
    return { ok: true }
  } catch (err) {
    if (err instanceof AgeGroupNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'age-group.not-found' })
    }
    if (err instanceof SeasonFrozenError) {
      throw createError({ statusCode: 409, statusMessage: 'season.frozen' })
    }
    throw err
  }
})
