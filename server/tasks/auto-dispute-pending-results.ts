import { resultsService } from '../modules/results'

/**
 * Cron-Task: pending MatchResults nach 3 Tagen ohne Bestätigung → disputed (FR-32).
 */
export default defineTask({
  meta: {
    name: 'auto-dispute-pending-results',
    description: 'Pending Match-Results nach 3 Tagen ohne Bestätigung auf disputed setzen',
  },
  run() {
    const disputed = resultsService.autoDisputeStale()
    return { result: { disputed } }
  },
})
