import { challengesService } from '../modules/challenges'

/**
 * Cron-Task: ACCEPTED ohne Ergebnis → DISPUTED nach 21 Tagen (FR-25 + design-decision).
 */
export default defineTask({
  meta: {
    name: 'dispute-stale-accepted',
    description: 'ACCEPTED Challenges ohne Ergebnis nach 21 Tagen auf DISPUTED setzen',
  },
  run() {
    const disputed = challengesService.disputeStaleAccepted()
    return { result: { disputed } }
  },
})
