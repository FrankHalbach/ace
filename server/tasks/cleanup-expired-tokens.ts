import { tokenService } from '../modules/auth'

/**
 * Cron-Task: täglich abgelaufene Magic-Link-Tokens löschen.
 *
 * Aufruf siehe nuxt.config.ts → nitro.scheduledTasks oder
 * via `POST /_nitro/tasks/cleanup-expired-tokens` während Dev.
 */
export default defineTask({
  meta: {
    name: 'cleanup-expired-tokens',
    description: 'Löscht abgelaufene Magic-Link-Tokens (siehe FR-114, NFR-7)',
  },
  run() {
    const deleted = tokenService.cleanupExpired()
    return { result: { deleted } }
  },
})
