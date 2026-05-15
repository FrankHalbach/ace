import { friendlyResultsService } from '../modules/friendlies'

/**
 * Cron-Task: pending FriendlyResults nach 3 Tagen ohne Bestätigung → disputed (FR-32).
 */
export default defineTask({
  meta: {
    name: 'auto-dispute-friendly-results',
    description: 'Pending Friendly-Results nach 3 Tagen ohne Bestätigung auf disputed setzen',
  },
  run() {
    const disputed = friendlyResultsService.autoDisputeStale()
    return { result: { disputed } }
  },
})
