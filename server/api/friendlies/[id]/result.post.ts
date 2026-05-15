import {
  AlreadyConfirmedError,
  FriendlyInvalidTransitionError,
  FriendlyNotFoundError,
  friendlyResultsService,
  InvalidSetsError,
  NotWinnerError,
  reportFriendlyResultInput,
  type FriendlyId,
} from '../../../modules/friendlies'
import { requireIntParam } from '../../../shared/require-role'

/** POST /api/friendlies/:id/result — Sieger-Team meldet Ergebnis */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requireIntParam(event, 'id') as FriendlyId
  const body = await readValidatedBody(event, reportFriendlyResultInput.parse)

  try {
    return friendlyResultsService.report(id, user.memberId, body)
  } catch (err) {
    if (err instanceof FriendlyNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'friendly.not-found' })
    if (err instanceof FriendlyInvalidTransitionError)
      throw createError({ statusCode: 409, statusMessage: 'friendly.invalid-transition' })
    if (err instanceof NotWinnerError)
      throw createError({ statusCode: 403, statusMessage: 'friendly.not-winner' })
    if (err instanceof InvalidSetsError)
      throw createError({ statusCode: 400, statusMessage: 'friendly.invalid-set-shape' })
    if (err instanceof AlreadyConfirmedError)
      throw createError({ statusCode: 409, statusMessage: 'friendly-result.already-confirmed' })
    throw err
  }
})
