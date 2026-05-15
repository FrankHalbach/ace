import {
  ChallengeValidationError,
  challengesService,
  createChallengeInput,
} from '../../modules/challenges'

/**
 * POST /api/challenges — Neue Challenge anlegen.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readValidatedBody(event, createChallengeInput.parse)

  try {
    return challengesService.create(user.memberId, body)
  } catch (err) {
    if (err instanceof ChallengeValidationError) {
      const status =
        err.code === 'challenge.same-member'
          ? 400
          : err.code.startsWith('challenge.too-many')
            ? 429
            : 409
      throw createError({ statusCode: status, statusMessage: err.code })
    }
    throw err
  }
})
