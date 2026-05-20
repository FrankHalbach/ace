import { evaluateSessionRefresh } from '../modules/auth'
import { profileService } from '../modules/members'

/**
 * Session-Refresh (#90): jeder authentifizierte API-Request liest die
 * aktuellen Rollen aus der DB statt der Session-Cookie zu vertrauen.
 *
 * Damit verlieren Player, die sich früher mit zusätzlichen Rollen
 * angemeldet hatten (oder denen die Admin/Trainer-Rolle entzogen wurde),
 * den Zugriff sofort beim nächsten API-Call — auch ohne Re-Login.
 *
 * Läuft NACH `00-auth.ts` (alphabetische Ordnung) und nur für
 * authentifizierte API-Calls — die Pre-Auth-Pfade `/api/auth/*` sind
 * ohnehin durch die Existenz-Prüfung in `00-auth.ts` ausgenommen.
 *
 * Performance: ein zusätzlicher Primary-Key-Lookup auf `member` pro
 * Request. Bei ≤500 Mitgliedern unkritisch.
 */
export default defineEventHandler(async (event) => {
  if (!event.path?.startsWith('/api/')) return
  if (event.path.startsWith('/api/auth/')) return

  const session = await getUserSession(event)
  const user = session.user
  if (!user) return // 00-auth.ts hat schon 401 geworfen — defensive

  const view = profileService.loadSessionView(user.memberId)
  const outcome = evaluateSessionRefresh(user, view)

  if (outcome.action === 'reject') {
    await clearUserSession(event)
    if (outcome.reason === 'member-deactivated') {
      throw createError({
        statusCode: 403,
        statusMessage: 'auth.member-deactivated',
      })
    }
    throw createError({
      statusCode: 401,
      statusMessage: 'auth.member-not-found',
    })
  }

  if (outcome.action === 'update') {
    await setUserSession(event, { user: outcome.user })
  }
})
