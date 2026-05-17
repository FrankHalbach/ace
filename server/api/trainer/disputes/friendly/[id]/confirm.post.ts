import {
  AlreadyConfirmedError,
  FriendlyInvalidTransitionError,
  FriendlyNotFoundError,
  type FriendlyId,
} from '../../../../../modules/friendlies'
import { DisputeNotFoundError, trainerDisputesService } from '../../../../../modules/trainer'
import { requirePublicIdParam } from '../../../../../shared/public-id'
import { requireTrainerOrAdmin } from '../../../../../shared/require-trainer'

/** POST /api/trainer/disputes/friendly/:id/confirm — Trainer bestätigt */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireTrainerOrAdmin(user)
  const id = requirePublicIdParam<FriendlyId>(event, 'id')
  try {
    trainerDisputesService.confirmFriendly(id)
    return { ok: true }
  } catch (err) {
    if (err instanceof DisputeNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'friendly-result.not-found' })
    if (err instanceof FriendlyNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'friendly.not-found' })
    if (err instanceof FriendlyInvalidTransitionError)
      throw createError({ statusCode: 409, statusMessage: 'friendly.invalid-transition' })
    if (err instanceof AlreadyConfirmedError)
      throw createError({ statusCode: 409, statusMessage: 'friendly-result.already-confirmed' })
    throw err
  }
})
