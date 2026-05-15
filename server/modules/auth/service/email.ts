/**
 * Email-Versand für Magic-Links.
 *
 * Produktiv: Brevo Transactional Email API.
 * Dev (kein `NUXT_BREVO_API_KEY`): Console-Log mit klickbarem Link.
 *
 * Wenn das `notifications`-Modul existiert, wandert diese Logik dort hin.
 */

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const SENDER = { name: 'ace · TuS Neureut', email: 'no-reply@tus-neureut.de' }

export type MagicLinkEmail = {
  to: { email: string; firstName: string }
  link: string
}

export async function sendMagicLinkEmail(payload: MagicLinkEmail): Promise<void> {
  const apiKey = process.env.NUXT_BREVO_API_KEY?.trim()
  if (!apiKey) {
    logStub(payload)
    return
  }

  const { html, text } = renderTemplate(payload)
  const response = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: payload.to.email, name: payload.to.firstName }],
      subject: 'Dein Login-Link für ace',
      htmlContent: html,
      textContent: text,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Brevo email failed: ${response.status} ${body}`)
  }
}

function logStub(payload: MagicLinkEmail): void {
  console.log('─'.repeat(72))
  console.log(`[Email Stub] Magic-Link für ${payload.to.email}`)
  console.log(`             ${payload.link}`)
  console.log('─'.repeat(72))
}

function renderTemplate(p: MagicLinkEmail): { html: string; text: string } {
  // Design-Tokens aus docs/design-system.md
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Dein Login-Link für ace</title>
</head>
<body style="margin:0;padding:0;background:#fafaf7;font-family:'Source Sans 3',sans-serif;color:#1a1a1a;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fafaf7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #e0dcd0;border-radius:12px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#2d5841;">Hallo ${escapeHtml(p.to.firstName)},</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
            klick auf den folgenden Link, um dich bei ace anzumelden. Der Link ist
            15 Minuten gültig und nur einmal nutzbar.
          </p>
          <p style="margin:24px 0;">
            <a href="${p.link}" style="display:inline-block;background:#2d5841;color:#fafaf7;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:16px;">Jetzt anmelden</a>
          </p>
          <p style="margin:24px 0 0;font-size:13px;color:#5a5a55;line-height:1.5;">
            Falls der Button nicht funktioniert, kopier diese Adresse in deinen Browser:<br>
            <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#2d5841;word-break:break-all;">${p.link}</span>
          </p>
          <p style="margin:32px 0 0;font-size:12px;color:#8b8a82;line-height:1.5;">
            Diese Mail wurde verschickt, weil jemand diese Email-Adresse für einen Login
            bei ace eingegeben hat. Wenn du das nicht warst, kannst du diese Mail
            einfach ignorieren — ohne deinen Klick passiert nichts.
          </p>
        </td></tr>
      </table>
      <p style="margin:24px 0 0;font-size:11px;color:#8b8a82;letter-spacing:0.1em;text-transform:uppercase;">ace · TuS Neureut · Tennisabteilung</p>
    </td></tr>
  </table>
</body>
</html>`

  const text = `Hallo ${p.to.firstName},

klick auf den folgenden Link, um dich bei ace anzumelden. Der Link ist 15 Minuten gültig und nur einmal nutzbar.

${p.link}

Falls du das nicht warst, kannst du diese Mail ignorieren — ohne deinen Klick passiert nichts.

ace · TuS Neureut · Tennisabteilung`

  return { html, text }
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
