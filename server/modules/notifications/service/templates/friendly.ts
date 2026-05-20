/**
 * Templates für `friendly.*`-Notifikationen.
 */
import type { Recipient } from '../../../members'
import type { NotificationEvent, RenderedEmail } from '../../types'
import { appBaseUrl, escapeHtml, germanDateTime, wrap } from './shared'

type Ctx = {
  recipient: Recipient
  names: Map<string, string>
}

function friendlyUrl(friendlyId: string): string {
  return `${appBaseUrl()}/friendlies/${friendlyId}`
}

function nameFor(memberId: string, ctx: Ctx): string {
  return ctx.names.get(memberId) ?? 'ein Spieler'
}

function formatLabel(f: 'singles' | 'doubles'): string {
  return f === 'singles' ? 'Einzel' : 'Doppel'
}

export function render(event: NotificationEvent & { key: `friendly.${string}` }, ctx: Ctx): RenderedEmail {
  switch (event.key) {
    case 'friendly.invited': {
      const initiator = nameFor(event.initiatorId, ctx)
      const body = wrap({
        heading: 'Einladung zum Freundschaftsspiel',
        intro: `<strong>${escapeHtml(initiator)}</strong> hat dich zu einem ${formatLabel(event.format)} eingeladen.`,
        detailLines: [`Termin: <strong>${escapeHtml(germanDateTime.format(event.scheduledAt))}</strong>`],
        ctaLabel: 'Einladung ansehen',
        ctaHref: friendlyUrl(event.friendlyId),
      })
      return {
        subject: `ace · ${formatLabel(event.format)}-Einladung von ${initiator}`,
        ...body,
      }
    }
    case 'friendly.accepted': {
      const responder = nameFor(event.responderId, ctx)
      const body = wrap({
        heading: 'Einladung angenommen',
        intro: `<strong>${escapeHtml(responder)}</strong> hat deine Einladung angenommen.`,
        detailLines: [`Termin: <strong>${escapeHtml(germanDateTime.format(event.scheduledAt))}</strong>`],
        ctaLabel: 'Match ansehen',
        ctaHref: friendlyUrl(event.friendlyId),
      })
      return { subject: `ace · ${responder} hat deine Einladung angenommen`, ...body }
    }
    case 'friendly.declined': {
      const responder = nameFor(event.responderId, ctx)
      const body = wrap({
        heading: 'Einladung abgelehnt',
        intro: `<strong>${escapeHtml(responder)}</strong> hat deine Einladung am ${escapeHtml(germanDateTime.format(event.scheduledAt))} abgelehnt.`,
        ctaLabel: 'Match-Plan ansehen',
        ctaHref: friendlyUrl(event.friendlyId),
      })
      return { subject: `ace · ${responder} hat deine Einladung abgelehnt`, ...body }
    }
    case 'friendly.cancelled': {
      const initiator = nameFor(event.initiatorId, ctx)
      const body = wrap({
        heading: 'Einladung zurückgezogen',
        intro: `<strong>${escapeHtml(initiator)}</strong> hat die Einladung zum ${escapeHtml(germanDateTime.format(event.scheduledAt))} zurückgezogen.`,
      })
      return { subject: `ace · ${initiator} hat die Einladung zurückgezogen`, ...body }
    }
    case 'friendly.result_reported': {
      const reporter = nameFor(event.reporterId, ctx)
      const body = wrap({
        heading: 'Ergebnis gemeldet — bitte bestätigen',
        intro: `<strong>${escapeHtml(reporter)}</strong> hat das Ergebnis eures Freundschaftsspiels gemeldet. Bitte bestätige oder widersprich innerhalb von 3 Tagen.`,
        ctaLabel: 'Ergebnis prüfen',
        ctaHref: friendlyUrl(event.friendlyId),
      })
      return { subject: 'ace · Bitte Match-Ergebnis bestätigen', ...body }
    }
    case 'friendly.result_confirmed': {
      const confirmer = nameFor(event.confirmerId, ctx)
      const body = wrap({
        heading: 'Ergebnis bestätigt',
        intro: `<strong>${escapeHtml(confirmer)}</strong> hat das Match-Ergebnis bestätigt.`,
        ctaLabel: 'Match ansehen',
        ctaHref: friendlyUrl(event.friendlyId),
      })
      return { subject: 'ace · Match-Ergebnis bestätigt', ...body }
    }
    case 'friendly.result_disputed': {
      const intro = event.auto
        ? 'Auf das gemeldete Ergebnis kam innerhalb von 3 Tagen keine Reaktion. Der Trainer entscheidet jetzt.'
        : `<strong>${escapeHtml(nameFor(event.disputerId ?? '', ctx))}</strong> hat dem gemeldeten Match-Ergebnis widersprochen. Der Trainer entscheidet jetzt.`
      const body = wrap({
        heading: 'Ergebnis strittig',
        intro,
        ctaLabel: 'Match ansehen',
        ctaHref: friendlyUrl(event.friendlyId),
      })
      return { subject: 'ace · Ergebnis strittig — Trainer entscheidet', ...body }
    }
  }
  const _exhaustive: never = event
  throw new Error(`Unhandled friendly event: ${JSON.stringify(_exhaustive)}`)
}
