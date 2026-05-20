/**
 * Auth-Modul Public API.
 *
 * Andere Module importieren ausschließlich aus dieser Datei (ADR-005).
 */
export { confirmMagicLink, requestMagicLink } from './service/auth-flow'
export { sendInviteEmail } from './service/email'
export { evaluateSessionRefresh } from './service/session-refresh'
export { tokenService } from './service/token'
export { InvalidTokenError, RateLimitExceededError, requestLinkInput } from './types'
export type { SessionUser, RequestLinkInput } from './types'
export type { SessionRefreshOutcome } from './service/session-refresh'
