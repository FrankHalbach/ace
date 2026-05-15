/**
 * POST /api/auth/logout
 * Session-Cookie löschen. Idempotent — auch ohne Session OK.
 */
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { ok: true }
})
