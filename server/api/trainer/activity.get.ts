import { trainerActivityService } from '../../modules/trainer'
import { requireTrainerOrAdmin } from '../../shared/require-trainer'

/** GET /api/trainer/activity — vereinsweite Aktivitäts-Übersicht */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireTrainerOrAdmin(user)
  return trainerActivityService.overview()
})
