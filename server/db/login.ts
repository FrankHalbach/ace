/**
 * Dev-Helper: erzeugt einen Magic-Link direkt für eine Email-Adresse und
 * gibt die Login-URL auf der Kommandozeile aus. Bypasst Rate-Limit und
 * Email-Versand komplett — gedacht für lokale Entwicklung, wenn der
 * normale HTTP-Flow zu umständlich ist (oder das Rate-Limit beißt).
 *
 * Ausführen:  pnpm db:login admin@neureut.de
 */
import { profileService } from '../modules/members'
import { tokenService } from '../modules/auth/service/token'

const email = process.argv[2]?.trim()
if (!email) {
  console.error('Email-Adresse fehlt.\n  pnpm db:login <email>')
  process.exit(2)
}

const member = profileService.findByEmail(email)
if (!member) {
  console.error(`Kein Mitglied mit Email '${email}' gefunden.`)
  process.exit(1)
}

const token = tokenService.issue(member.id)
const baseUrl = (process.env.NUXT_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

console.log(`${baseUrl}/api/auth/confirm/${token}`)
