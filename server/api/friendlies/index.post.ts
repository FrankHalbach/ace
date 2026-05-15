import {
  createFriendlyInput,
  friendliesService,
  FriendlyValidationError,
} from '../../modules/friendlies'

/** POST /api/friendlies — Neues Friendly anlegen */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readValidatedBody(event, createFriendlyInput.parse)

  try {
    return friendliesService.create(user.memberId, body)
  } catch (err) {
    if (err instanceof FriendlyValidationError) {
      const status =
        err.code === 'friendly.same-member' ||
        err.code === 'friendly.duplicate-member' ||
        err.code === 'friendly.invalid-team-shape' ||
        err.code === 'friendly.scheduled-in-past'
          ? 400
          : err.code === 'friendly.too-many-today'
            ? 429
            : 409
      throw createError({ statusCode: status, statusMessage: err.code })
    }
    throw err
  }
})
