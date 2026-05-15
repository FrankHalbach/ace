/**
 * Session-Middleware für alle /api/*-Routen.
 *
 * Architektur-Übersicht § 6.2: zentrale Server-Middleware prüft Session.
 * Ausnahmen sind /api/auth/*-Routen, die naturgemäß ohne Session erreichbar
 * sein müssen.
 */
export default defineEventHandler(async (event) => {
  if (!event.path?.startsWith('/api/')) return
  if (event.path.startsWith('/api/auth/')) return

  const { user } = await getUserSession(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'auth.session-required',
    })
  }
})
