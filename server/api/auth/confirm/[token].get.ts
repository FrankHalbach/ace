import { confirmMagicLink, InvalidTokenError } from '../../../modules/auth'

/**
 * GET /api/auth/confirm/:token
 *
 * Magic-Link-Token einlösen, Session-Cookie setzen, zur Startseite weiterleiten.
 * Bei Fehler: Redirect zu /login mit error-Code.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'auth.invalid-token' })
  }

  try {
    const session = confirmMagicLink(token)
    await setUserSession(event, { user: session })
    return sendRedirect(event, '/', 302)
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      return sendRedirect(event, `/login?error=${err.reason}`, 302)
    }
    throw err
  }
})
