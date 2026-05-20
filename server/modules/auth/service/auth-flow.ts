import { profileService } from '../../members'
import { sendMagicLinkEmail } from './email'
import { rateLimitService } from './rate-limit'
import { tokenService } from './token'
import type { SessionUser } from '../types'

/**
 * Orchestriert den Magic-Link-Request:
 *   Rate-Limit prüfen → Member nachschlagen → Token ausstellen → Email versenden.
 *
 * Bei unbekannter Email wird trotzdem 200 zurückgegeben (kein User-Enumeration);
 * Token und Email werden in dem Fall nicht erzeugt.
 */
export async function requestMagicLink(email: string, baseUrl: string): Promise<void> {
  rateLimitService.enforceMagicLink(email)

  const member = profileService.findByEmail(email)
  if (!member) {
    // Stiller Erfolg — keine User-Enumeration
    return
  }

  const token = tokenService.issue(member.id)
  const link = `${baseUrl.replace(/\/$/, '')}/api/auth/confirm/${token}`

  await sendMagicLinkEmail({
    to: { email: member.email, firstName: member.firstName },
    link,
  })
}

/**
 * Wandelt einen gültigen Magic-Link-Token in eine Session um.
 * Wirft `InvalidTokenError`, wenn der Token nicht (mehr) gültig ist.
 */
export function confirmMagicLink(token: string): SessionUser {
  const memberId = tokenService.consume(token)
  const member = profileService.findById(memberId)
  if (!member) {
    // Datenkonsistenz-Problem: Token ist da, Member nicht mehr. Sollte nie passieren
    // wegen FK-Cascade — defensive return.
    throw new Error(`member ${memberId} disappeared between token issue and confirm`)
  }
  profileService.markFirstLoginIfMissing(member.id)
  return { memberId: member.id, roles: member.roles }
}
