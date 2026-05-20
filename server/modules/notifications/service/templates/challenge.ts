/**
 * Templates für `challenge.*`-Notifikationen.
 *
 * Jede Funktion bekommt das Event + Recipient + die Member-Display-Namen,
 * die der Dispatcher schon aufgelöst hat. Rückgabe: Subject + HTML + Text.
 */
import type { Recipient } from '../../../members'
import type { NotificationEvent, RenderedEmail } from '../../types'
import { appBaseUrl, escapeHtml, wrap } from './shared'

type Ctx = {
  recipient: Recipient
  /** Map MemberId → Anzeigename, für die im Event erwähnten Counterparties. */
  names: Map<string, string>
}

function challengeUrl(): string {
  return `${appBaseUrl()}/challenges`
}

function nameFor(memberId: string, ctx: Ctx): string {
  return ctx.names.get(memberId) ?? 'ein Spieler'
}

export function render(event: NotificationEvent & { key: `challenge.${string}` }, ctx: Ctx): RenderedEmail {
  switch (event.key) {
    case 'challenge.received': {
      const other = nameFor(event.challengerId, ctx)
      const body = wrap({
        heading: 'Neue Herausforderung',
        intro: `<strong>${escapeHtml(other)}</strong> hat dich in der Rangliste <strong>${escapeHtml(event.rankingName)}</strong> zum Match gefordert.`,
        ctaLabel: 'Forderung ansehen',
        ctaHref: challengeUrl(),
        detailLines: [
          'Antwortzeit: 7 Tage — sonst läuft die Forderung automatisch ab.',
        ],
      })
      return { subject: `ace · Neue Herausforderung von ${other}`, ...body }
    }
    case 'challenge.accepted': {
      const other = nameFor(event.accepterId, ctx)
      const body = wrap({
        heading: 'Deine Forderung wurde angenommen',
        intro: `<strong>${escapeHtml(other)}</strong> hat deine Forderung in <strong>${escapeHtml(event.rankingName)}</strong> angenommen.`,
        ctaLabel: 'Termin abstimmen',
        ctaHref: challengeUrl(),
        detailLines: [
          'Ihr habt jetzt 21 Tage Zeit, das Match zu spielen.',
        ],
      })
      return { subject: `ace · ${other} hat deine Forderung angenommen`, ...body }
    }
    case 'challenge.declined': {
      const other = nameFor(event.declinerId, ctx)
      const reasonLabel: Record<string, string> = {
        injury: 'Verletzung',
        vacation: 'Urlaub',
        work: 'Beruflich verhindert',
        other: 'Sonstiger Grund',
      }
      const details: string[] = []
      if (event.reason) details.push(`Grund: ${escapeHtml(reasonLabel[event.reason] ?? event.reason)}`)
      if (event.note) details.push(`Notiz: ${escapeHtml(event.note)}`)
      const body = wrap({
        heading: 'Deine Forderung wurde abgelehnt',
        intro: `<strong>${escapeHtml(other)}</strong> hat deine Forderung in <strong>${escapeHtml(event.rankingName)}</strong> abgelehnt.`,
        detailLines: details,
        ctaLabel: 'Forderungen ansehen',
        ctaHref: challengeUrl(),
      })
      return { subject: `ace · ${other} hat deine Forderung abgelehnt`, ...body }
    }
    case 'challenge.expired': {
      const other = nameFor(event.counterpartyId, ctx)
      const intro =
        event.role === 'challenger'
          ? `Deine Forderung an <strong>${escapeHtml(other)}</strong> in <strong>${escapeHtml(event.rankingName)}</strong> ist abgelaufen — sie wurde nicht innerhalb von 7 Tagen beantwortet.`
          : `Du hast die Forderung von <strong>${escapeHtml(other)}</strong> in <strong>${escapeHtml(event.rankingName)}</strong> nicht beantwortet. Sie ist jetzt abgelaufen.`
      const body = wrap({
        heading: 'Forderung abgelaufen',
        intro,
        ctaLabel: 'Forderungen ansehen',
        ctaHref: challengeUrl(),
      })
      return { subject: 'ace · Forderung abgelaufen', ...body }
    }
    case 'challenge.result_reported': {
      const other = nameFor(event.reporterId, ctx)
      const body = wrap({
        heading: 'Ergebnis gemeldet — bitte bestätigen',
        intro: `<strong>${escapeHtml(other)}</strong> hat das Ergebnis eures Matches gemeldet. Bitte bestätige oder widersprich innerhalb von 3 Tagen — sonst geht der Streitfall an den Trainer.`,
        ctaLabel: 'Ergebnis prüfen',
        ctaHref: challengeUrl(),
      })
      return { subject: 'ace · Bitte Match-Ergebnis bestätigen', ...body }
    }
    case 'challenge.result_confirmed': {
      const other = nameFor(event.confirmerId, ctx)
      const body = wrap({
        heading: 'Ergebnis bestätigt',
        intro: `<strong>${escapeHtml(other)}</strong> hat das gemeldete Match-Ergebnis bestätigt. Die Rangliste ist aktualisiert.`,
        ctaLabel: 'Rangliste ansehen',
        ctaHref: `${appBaseUrl()}/rankings`,
      })
      return { subject: 'ace · Match-Ergebnis bestätigt', ...body }
    }
    case 'challenge.result_disputed': {
      const intro = event.auto
        ? 'Auf das gemeldete Match-Ergebnis kam innerhalb von 3 Tagen keine Reaktion. Der Trainer entscheidet jetzt.'
        : `<strong>${escapeHtml(nameFor(event.disputerId ?? '', ctx))}</strong> hat dem gemeldeten Match-Ergebnis widersprochen. Der Trainer entscheidet jetzt.`
      const body = wrap({
        heading: 'Ergebnis strittig',
        intro,
        ctaLabel: 'Match ansehen',
        ctaHref: challengeUrl(),
      })
      return { subject: 'ace · Ergebnis strittig — Trainer entscheidet', ...body }
    }
  }
  // Exhaustiveness-Check
  const _exhaustive: never = event
  throw new Error(`Unhandled challenge event: ${JSON.stringify(_exhaustive)}`)
}
