import { escapeHtml } from '../../../../shared/email-transport'
import type { Recipient } from '../../../members'

export { escapeHtml }

/**
 * Templates lesen `appBaseUrl` zur Konstruktion der Deep-Links. Wenn keine
 * Env gesetzt ist, wird `https://ace.tus-neureut.de` als Stub verwendet — in
 * Dev läuft der Email-Transport ohnehin nur als Console-Stub.
 */
export function appBaseUrl(): string {
  return (process.env.NUXT_PUBLIC_APP_URL?.trim() || 'https://ace.tus-neureut.de').replace(
    /\/$/,
    '',
  )
}

export const germanDateTime = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function displayName(r: Recipient): string {
  return `${r.firstName} ${r.lastName}`.trim()
}

/**
 * Layout-Wrapper für alle Notif-Mails. Identisch im Look mit
 * Magic-Link und Invite, aber neutraler Header — wir wollen pro Mail
 * ein klares Subject statt eines „Hallo"-H1.
 */
export function wrap(args: {
  heading: string
  intro: string
  ctaLabel?: string
  ctaHref?: string
  detailLines?: string[]
  footerNote?: string
}): { html: string; text: string } {
  const cta = args.ctaHref
    ? `<p style="margin:24px 0;">
         <a href="${args.ctaHref}" style="display:inline-block;background:#2d5841;color:#fafaf7;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:16px;">${escapeHtml(args.ctaLabel ?? 'Öffnen')}</a>
       </p>`
    : ''

  const details = args.detailLines?.length
    ? `<ul style="margin:16px 0;padding-left:20px;font-size:15px;line-height:1.6;color:#3a3a35;">
         ${args.detailLines.map((l) => `<li>${l}</li>`).join('')}
       </ul>`
    : ''

  const footer =
    args.footerNote ??
    `Diese Benachrichtigungen kannst du im <a href="${appBaseUrl()}/profile" style="color:#2d5841;">Profil</a> ein- und ausschalten.`

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${escapeHtml(args.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#fafaf7;font-family:'Source Sans 3',sans-serif;color:#1a1a1a;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fafaf7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #e0dcd0;border-radius:12px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#2d5841;">${escapeHtml(args.heading)}</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${args.intro}</p>
          ${details}
          ${cta}
          <p style="margin:32px 0 0;font-size:12px;color:#8b8a82;line-height:1.5;">${footer}</p>
        </td></tr>
      </table>
      <p style="margin:24px 0 0;font-size:11px;color:#8b8a82;letter-spacing:0.1em;text-transform:uppercase;">ace · TuS Neureut · Tennisabteilung</p>
    </td></tr>
  </table>
</body>
</html>`

  const detailLines = args.detailLines?.length
    ? '\n' + args.detailLines.map((l) => `  • ${stripHtml(l)}`).join('\n') + '\n'
    : ''

  const ctaText = args.ctaHref ? `\n${args.ctaLabel ?? 'Öffnen'}: ${args.ctaHref}\n` : ''

  const text =
    `${args.heading}\n\n` +
    `${stripHtml(args.intro)}\n` +
    detailLines +
    ctaText +
    `\n${stripHtml(footer)}\n\n` +
    'ace · TuS Neureut · Tennisabteilung\n'

  return { html, text }
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}
