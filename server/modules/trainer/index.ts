/**
 * Trainer-Modul Public API (ADR-005).
 */
export { trainerActivityService } from './service/activity'
export { trainerDisputesService } from './service/disputes'
export { DisputeNotFoundError } from './types'
export type { ActivityOverviewRow, DisputeListItem } from './types'
