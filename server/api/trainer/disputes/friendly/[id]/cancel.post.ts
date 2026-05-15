import {
  FriendlyInvalidTransitionError,
  FriendlyNotFoundError,
  type FriendlyId,
} from '../../../../../modules/friendlies'
import { trainerDisputesService } from '../../../../../modules/trainer'
import { requireIntParam } from '../../../../../shared/require-role'
import { requireTrainerOrAdmin } from '../../../../../shared/require-trainer'

/** POST /api/trainer/disputes/friendly/:id/cancel — Trainer bricht Match ab */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireTrainerOrAdmin(user)
  const id = requireIntParam(event, 'id') as FriendlyId
  try {
    trainerDisputesService.cancelFriendly(id)
    return { ok: true }
  } catch (err) {
    if (err instanceof FriendlyNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'friendly.not-found' })
    if (err instanceof FriendlyInvalidTransitionError)
      throw createError({ statusCode: 409, statusMessage: 'friendly.invalid-transition' })
    throw err
  }
})
