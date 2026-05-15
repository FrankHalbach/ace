import { generateForSeason } from '../../../modules/rankings'
import {
  SeasonInvalidTransitionError,
  SeasonNotFoundError,
  seasonsService,
  type SeasonId,
} from '../../../modules/seasons'
import { requireIntParam, requireRole } from '../../../shared/require-role'

/**
 * POST /api/seasons/:id/start — PLANNED → ACTIVE
 *
 * Orchestriert zwei Schritte:
 *   1. seasons:  Status-Transition PLANNED → ACTIVE
 *   2. rankings: Ranglisten aus AgeGroups + Members generieren
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')
  const id = requireIntParam(event, 'id') as SeasonId

  try {
    const season = seasonsService.start(id)
    generateForSeason(id)
    return season
  } catch (err) {
    if (err instanceof SeasonNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'season.not-found' })
    }
    if (err instanceof SeasonInvalidTransitionError) {
      throw createError({ statusCode: 409, statusMessage: 'season.invalid-transition' })
    }
    throw err
  }
})
