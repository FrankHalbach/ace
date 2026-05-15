import { RateLimitExceededError, requestLinkInput, requestMagicLink } from '../../modules/auth'

/**
 * POST /api/auth/request-link
 *
 * Magic-Link an die übergebene Email-Adresse versenden.
 * Bei unbekannter Email-Adresse trotzdem 200 (kein User-Enumeration).
 * Rate-Limit: FR-114 — 3 Anfragen pro Stunde pro Email.
 */
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, requestLinkInput.parse)
  const baseUrl = useRuntimeConfig().public.baseUrl

  try {
    await requestMagicLink(body.email, baseUrl)
    return { ok: true }
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      throw createError({
        statusCode: 429,
        statusMessage: 'auth.rate-limit-exceeded',
      })
    }
    throw err
  }
})
