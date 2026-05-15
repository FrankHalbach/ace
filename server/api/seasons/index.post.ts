import { createSeasonInput, SeasonNameTakenError, seasonsService } from '../../modules/seasons'
import { requireRole } from '../../shared/require-role'

/**
 * POST /api/seasons — Admin-only, legt eine Saison im Status PLANNED an.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')

  const body = await readValidatedBody(event, createSeasonInput.parse)
  try {
    return seasonsService.create(body)
  } catch (err) {
    if (err instanceof SeasonNameTakenError) {
      throw createError({ statusCode: 409, statusMessage: 'season.name-taken' })
    }
    throw err
  }
})
