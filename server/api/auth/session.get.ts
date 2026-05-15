/**
 * GET /api/auth/session
 * Aktuelle Session zurückgeben, oder null bei ausgeloggtem Zustand.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  return session.user ?? null
})
