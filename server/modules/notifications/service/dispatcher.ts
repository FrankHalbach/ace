/**
 * Notif-Dispatcher: Pref-Filterung, Rendern, Senden.
 *
 * Eintrittspunkt aus den Service-Layern. Niemals geworfene Fehler — eine
 * fehlgeschlagene Mail darf eine erfolgreiche DB-Mutation nicht in einen
 * 500 verwandeln.
 */
import { sendEmail } from '../../../shared/email-transport'
import { profileService, type MemberId, type Recipient } from '../../members'
import type { NotificationEvent } from '../types'
import { render as renderChallenge } from './templates/challenge'
import { render as renderFriendly } from './templates/friendly'

/**
 * Sammelt alle MemberIds, deren Display-Namen ein Template braucht.
 * Bewusst defensiv: jeder Eventtyp kann eine andere Counterparty-ID haben.
 */
function counterpartyIdsOf(event: NotificationEvent): MemberId[] {
  switch (event.key) {
    case 'challenge.received':
      return [event.challengerId]
    case 'challenge.accepted':
      return [event.accepterId]
    case 'challenge.declined':
      return [event.declinerId]
    case 'challenge.expired':
      return [event.counterpartyId]
    case 'challenge.result_reported':
      return [event.reporterId]
    case 'challenge.result_confirmed':
      return [event.confirmerId]
    case 'challenge.result_disputed':
      return event.disputerId ? [event.disputerId] : []
    case 'friendly.invited':
      return [event.initiatorId]
    case 'friendly.accepted':
    case 'friendly.declined':
      return [event.responderId]
    case 'friendly.cancelled':
      return [event.initiatorId]
    case 'friendly.result_reported':
      return [event.reporterId]
    case 'friendly.result_confirmed':
      return [event.confirmerId]
    case 'friendly.result_disputed':
      return event.disputerId ? [event.disputerId] : []
  }
}

function isChallengeEvent(
  event: NotificationEvent,
): event is NotificationEvent & { key: `challenge.${string}` } {
  return event.key.startsWith('challenge.')
}

async function dispatchOne(event: NotificationEvent): Promise<void> {
  const recipient = profileService.findRecipient(event.recipientId)
  if (!recipient) {
    console.warn(`[notify] recipient not found: ${event.recipientId} for ${event.key}`)
    return
  }
  if (!recipient.isActive) return
  if (recipient.prefs[event.key] === false) return

  const counterparties = counterpartyIdsOf(event)
  const names = new Map<string, string>()
  for (const id of counterparties) {
    const r = profileService.findRecipient(id)
    if (r) names.set(id, `${r.firstName} ${r.lastName}`.trim())
  }

  const ctx: { recipient: Recipient; names: Map<string, string> } = { recipient, names }
  const rendered = isChallengeEvent(event)
    ? renderChallenge(event, ctx)
    : renderFriendly(event, ctx)

  await sendEmail({
    kind: event.key,
    to: { email: recipient.email, firstName: recipient.firstName },
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  })
}

export const notifyService = {
  /**
   * Versendet eine Notifikation. Niemals Caller-Wirkung: Fehler werden
   * geloggt, aber nicht geworfen.
   *
   * Aufrufer können auf `void`-Aufruf gehen (`void notifyService.dispatch(…)`);
   * wer auf das Promise wartet, sieht den (immer erfolgreichen) Abschluss.
   */
  async dispatch(event: NotificationEvent): Promise<void> {
    try {
      await dispatchOne(event)
    } catch (err) {
      console.error(`[notify] dispatch failed for ${event.key}:`, err)
    }
  },

  /**
   * Mehrere Events parallel (Fan-Out für mehrere Empfänger). Wirft nie.
   */
  async dispatchMany(events: NotificationEvent[]): Promise<void> {
    await Promise.all(events.map((e) => this.dispatch(e)))
  },
}
