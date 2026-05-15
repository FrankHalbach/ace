/**
 * Auth-Modul Public API.
 *
 * Andere Module importieren ausschließlich aus dieser Datei (ADR-005).
 */
export { confirmMagicLink, requestMagicLink } from './service/auth-flow'
export { tokenService } from './service/token'
export { InvalidTokenError, RateLimitExceededError, requestLinkInput } from './types'
export type { SessionUser, RequestLinkInput } from './types'
