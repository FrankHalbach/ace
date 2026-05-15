import { resultsService } from '../../../modules/results'
import type { ChallengeId } from '../../../modules/challenges'
import { requireIntParam } from '../../../shared/require-role'

/**
 * GET /api/match-results/by-challenge/:id — für UI-Bequemlichkeit.
 * Liefert null statt 404, wenn noch kein Ergebnis existiert.
 */
export default defineEventHandler((event) => {
  const id = requireIntParam(event, 'id') as ChallengeId
  return resultsService.findForChallenge(id) ?? null
})
