import { resultsService } from '../../../modules/results'
import type { ChallengeId } from '../../../modules/challenges'
import { requirePublicIdParam } from '../../../shared/public-id'

/**
 * GET /api/match-results/by-challenge/:id — für UI-Bequemlichkeit.
 * Liefert null statt 404, wenn noch kein Ergebnis existiert.
 */
export default defineEventHandler((event) => {
  const id = requirePublicIdParam<ChallengeId>(event, 'id')
  return resultsService.findForChallenge(id) ?? null
})
