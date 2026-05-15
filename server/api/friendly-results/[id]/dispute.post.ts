import {
  AlreadyConfirmedError,
  disputeFriendlyResultInput,
  friendlyResultsService,
  FriendlyResultNotFoundError,
  NotLoserError,
  type FriendlyResultId,
} from '../../../modules/friendlies'
import { requireIntParam } from '../../../shared/require-role'

/** POST /api/friendly-results/:id/dispute — Verlierer-Team-Mitglied widerspricht */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = requireIntParam(event, 'id') as FriendlyResultId
  const body = await readValidatedBody(event, disputeFriendlyResultInput.parse)
  try {
    return friendlyResultsService.dispute(id, user.memberId, body)
  } catch (err) {
    if (err instanceof FriendlyResultNotFoundError)
      throw createError({ statusCode: 404, statusMessage: 'friendly-result.not-found' })
    if (err instanceof NotLoserError)
      throw createError({ statusCode: 403, statusMessage: 'friendly.not-loser' })
    if (err instanceof AlreadyConfirmedError)
      throw createError({ statusCode: 409, statusMessage: 'friendly-result.already-confirmed' })
    throw err
  }
})
