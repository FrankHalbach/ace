import { challengesService } from '../modules/challenges'

/**
 * Cron-Task: PROPOSED → EXPIRED nach 7 Tagen ohne Reaktion (FR-24).
 */
export default defineTask({
  meta: {
    name: 'expire-proposed-challenges',
    description: 'PROPOSED Challenges nach 7 Tagen ohne Reaktion auf EXPIRED setzen',
  },
  run() {
    const expired = challengesService.expireStaleProposed()
    return { result: { expired } }
  },
})
