import { seasonsService } from '../../modules/seasons'

/**
 * GET /api/seasons — Saison-Liste, allen eingeloggten Mitgliedern zugänglich.
 */
export default defineEventHandler(() => {
  return seasonsService.list()
})
