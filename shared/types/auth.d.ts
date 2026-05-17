/**
 * Type-Augmentation für nuxt-auth-utils.
 *
 * Macht den Session-User stark typisiert: getUserSession() / requireUserSession()
 * liefern user als unsere SessionUser-Form.
 *
 * Liegt in shared/, damit sowohl das App- als auch das Server-tsconfig die
 * Augmentation sehen (App-tsconfig includet `../shared/**\/*.d.ts`,
 * Server-tsconfig dito).
 */
/* eslint-disable no-unused-vars */
import type { SessionUser } from '#server/modules/auth'

declare module '#auth-utils' {
  interface User extends SessionUser {}
  interface UserSession {
    user: SessionUser
  }
}

export {}
