/**
 * Type-Augmentation für nuxt-auth-utils.
 *
 * Macht den Session-User stark typisiert: getUserSession() / requireUserSession()
 * liefern user als unsere SessionUser-Form.
 */
/* eslint-disable no-unused-vars */
import type { SessionUser } from '../modules/auth'

declare module '#auth-utils' {
  interface User extends SessionUser {}
  interface UserSession {
    user: SessionUser
  }
}

export {}
