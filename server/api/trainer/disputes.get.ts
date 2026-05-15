import { trainerDisputesService } from '../../modules/trainer'
import { requireTrainerOrAdmin } from '../../shared/require-trainer'

/** GET /api/trainer/disputes — alle DISPUTED Challenges + Friendlies */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireTrainerOrAdmin(user)
  return trainerDisputesService.list()
})
