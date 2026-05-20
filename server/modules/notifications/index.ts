/**
 * Notifications-Modul Public API (ADR-005).
 *
 * Implementiert FR-70 (sofortige Email bei Challenge-/Friendly-Lifecycle).
 * Aufrufer schicken `NotificationEvent`s; das Modul filtert nach
 * `notificationPrefs`, rendert das Template und sendet.
 *
 * Out-of-scope (separate PRs):
 *   - FR-115 stündlicher Digest
 *   - FR-71 Web-Push
 *   - Trainer-Match-Empfehlung-Notif (lebt im suggestions-Modul)
 */
export { notifyService } from './service/dispatcher'
export type { NotificationEvent, RenderedEmail } from './types'
