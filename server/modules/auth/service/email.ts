/**
 * Email-Versand für Magic-Links und Admin-Invites.
 *
 * Transport-Auswahl per Env passiert in `server/shared/email-transport.ts`.
 * Diese Datei rendert nur noch Templates.
 */
import { escapeHtml, sendEmail } from '../../../shared/email-transport'

export type MagicLinkEmail = {
  to: { email: string; firstName: string }
  link: string
}

export type InviteEmail = {
  to: { email: string; firstName: string }
  link: string
  inviterName: string
}

export async function sendMagicLinkEmail(payload: MagicLinkEmail): Promise<void> {
  const { html, text } = renderMagicLinkTemplate(payload)
  await sendEmail({
    kind: 'Magic-Link',
    to: payload.to,
    subject: 'Dein Login-Link für ace',
    html,
    text,
    logHint: payload.link,
  })
}

export async function sendInviteEmail(payload: InviteEmail): Promise<void> {
  const { html, text } = renderInviteTemplate(payload)
  await sendEmail({
    kind: 'Invite',
    to: payload.to,
    subject: 'Willkommen bei ace – deine Einladung',
    html,
    text,
    logHint: payload.link,
  })
}

function renderMagicLinkTemplate(p: MagicLinkEmail): { html: string; text: string } {
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

function renderInviteTemplate(p: InviteEmail): { html: string; text: string } {
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Willkommen bei ace</title>
</head>
<body style="margin:0;padding:0;background:#fafaf7;font-family:'Source Sans 3',sans-serif;color:#1a1a1a;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fafaf7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #e0dcd0;border-radius:12px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#2d5841;">Hallo ${escapeHtml(p.to.firstName)},</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
            ${escapeHtml(p.inviterName)} hat dich für <strong>ace</strong> freigeschaltet,
            die interne Plattform der Tennisabteilung des TuS Neureut.
          </p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
            Auf ace findest du die Vereins-Rangliste, kannst andere zur Challenge fordern
            und Freundschaftsspiele verabreden.
          </p>
          <p style="margin:24px 0;">
            <a href="${p.link}" style="display:inline-block;background:#2d5841;color:#fafaf7;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:16px;">Account einrichten</a>
          </p>
          <p style="margin:24px 0 0;font-size:13px;color:#5a5a55;line-height:1.5;">
            Der Link ist 30 Tage gültig und nur einmal nutzbar. Falls der Button nicht funktioniert,
            kopier diese Adresse in deinen Browser:<br>
            <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#2d5841;word-break:break-all;">${p.link}</span>
          </p>
          <p style="margin:32px 0 0;font-size:12px;color:#8b8a82;line-height:1.5;">
            Wenn du diese Mail nicht erwartet hast, kannst du sie ignorieren — ohne deinen
            Klick wird kein Account aktiviert.
          </p>
        </td></tr>
      </table>
      <p style="margin:24px 0 0;font-size:11px;color:#8b8a82;letter-spacing:0.1em;text-transform:uppercase;">ace · TuS Neureut · Tennisabteilung</p>
    </td></tr>
  </table>
</body>
</html>`

  const text = `Hallo ${p.to.firstName},

${p.inviterName} hat dich für ace freigeschaltet, die interne Plattform der Tennisabteilung
des TuS Neureut. Auf ace findest du die Vereins-Rangliste, kannst andere zur Challenge fordern
und Freundschaftsspiele verabreden.

Account einrichten:
${p.link}

Der Link ist 30 Tage gültig und nur einmal nutzbar.

ace · TuS Neureut · Tennisabteilung`

  return { html, text }
}
