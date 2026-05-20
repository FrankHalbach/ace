/**
 * Geteilter Email-Transport.
 *
 * Liefert nodemailer-Transport, wenn `NUXT_SMTP_HOST` gesetzt ist
 * (Dev: Papercut · Prod: smtp-relay.brevo.com). Sonst Console-Stub.
 *
 * Verbraucher:
 *   - Magic-Link  (server/modules/auth/service/email.ts)
 *   - Admin-Invite (server/modules/auth/service/email.ts)
 *   - Notifications (server/modules/notifications/service/dispatcher.ts)
 *
 * Vorher lag der Transport in auth/service/email.ts. Da auch
 * notifications ihn braucht, wurde er hierher gezogen — neutraler
 * Infrastruktur-Code, kein Modul-Cross-Call.
 */
import nodemailer, { type Transporter } from 'nodemailer'

const DEFAULT_FROM = 'ace · TuS Neureut <no-reply@tus-neureut.de>'

export type EmailRecipient = { email: string; firstName: string }

export type EmailPayload = {
  kind: string
  to: EmailRecipient
  subject: string
  html: string
  text: string
  /** Wenn Transport im Stub-Modus läuft, wird dieser Link mitgeloggt. */
  logHint?: string
}

/**
 * Versendet eine Mail über den konfigurierten Transport.
 *
 * Wenn `NUXT_SMTP_HOST` nicht gesetzt ist, loggt der Aufruf den
 * `logHint` (falls vorhanden) und kehrt erfolgreich zurück. Aufrufer
 * sollen Fehler abfangen — sie sind nie kritisch für die DB-Mutation.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  const transport = getTransport()
  if (!transport) {
    logStub(payload)
    return
  }
  await transport.sendMail({
    from: process.env.NUXT_MAIL_FROM?.trim() || DEFAULT_FROM,
    to: { name: payload.to.firstName, address: payload.to.email },
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  })
}

let cachedTransport: Transporter | null | undefined

function getTransport(): Transporter | null {
  if (cachedTransport !== undefined) return cachedTransport

  const host = process.env.NUXT_SMTP_HOST?.trim()
  if (!host) {
    cachedTransport = null
    return null
  }

  const port = Number(process.env.NUXT_SMTP_PORT?.trim() || '25')
  const secure = process.env.NUXT_SMTP_SECURE?.trim() === 'true'
  const user = process.env.NUXT_SMTP_USER?.trim()
  const pass = process.env.NUXT_SMTP_PASS?.trim()

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  })
  return cachedTransport
}

/** Test-Hook: setzt den Modul-Cache zurück, damit Tests die Env neu lesen. */
export function __resetTransportForTests(): void {
  cachedTransport = undefined
}

function logStub(payload: EmailPayload): void {
  console.log('─'.repeat(72))
  console.log(`[Email Stub] ${payload.kind} → ${payload.to.email}`)
  console.log(`             ${payload.subject}`)
  if (payload.logHint) console.log(`             ${payload.logHint}`)
  console.log('─'.repeat(72))
}

export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
