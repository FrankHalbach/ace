import { randomBytes } from 'node:crypto'
import { tokenRepo } from '../repository/token-repo'
import { InvalidTokenError, type MemberId } from '../types'

/** 15 Minuten — siehe ADR-003 und Spec NFR-2. */
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000

/** 30 Tage — Invite-Tokens bekommen einen längeren Lebenszyklus als Login-Links (Admin-Design-Doc). */
export const INVITE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** 32 Bytes Entropie → 64 hex-Zeichen. */
const TOKEN_BYTES = 32

export const tokenService = {
  /**
   * Erzeugt und persistiert einen neuen Magic-Link-Token.
   * Vorherige Tokens des Members bleiben gemäß Design-Doc parallel gültig.
   */
  issue(memberId: MemberId, now: Date = new Date()): string {
    const token = randomBytes(TOKEN_BYTES).toString('hex')
    const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS)
    tokenRepo.insert({ token, memberId, createdAt: now, expiresAt })
    return token
  },

  /**
   * Invite-Variante: gleicher Token-Typ, gleiches Konsum-Verfahren, nur TTL
   * länger (30 Tage statt 15 min) — Einladungs-Mails überleben einen
   * Urlaub. Konsum setzt zusätzlich `firstLoginAt` im Member, falls leer.
   */
  issueInvite(memberId: MemberId, now: Date = new Date()): string {
    const token = randomBytes(TOKEN_BYTES).toString('hex')
    const expiresAt = new Date(now.getTime() + INVITE_TOKEN_TTL_MS)
    tokenRepo.insert({ token, memberId, createdAt: now, expiresAt })
    return token
  },

  /**
   * Validiert einen Token und markiert ihn als konsumiert (Single-Use).
   * Wirft `InvalidTokenError` bei unbekanntem, abgelaufenem oder bereits
   * konsumiertem Token.
   */
  consume(token: string, now: Date = new Date()): MemberId {
    const row = tokenRepo.findByToken(token)
    if (!row) throw new InvalidTokenError('unknown')
    if (row.consumedAt) throw new InvalidTokenError('consumed')
    if (row.expiresAt < now) throw new InvalidTokenError('expired')

    tokenRepo.markConsumed(token)
    return row.memberId
  },

  /** Löscht abgelaufene Tokens. Idempotent — täglich von Cron aufgerufen. */
  cleanupExpired(now: Date = new Date()): number {
    return tokenRepo.deleteExpired(now)
  },
}
