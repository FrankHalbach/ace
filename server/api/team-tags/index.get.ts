import { teamTagsService } from '../../modules/team-tags'
import { requireAnyRole } from '../../shared/require-role'

/**
 * GET /api/team-tags — Liste aller Mannschafts-Tags (inkl. archivierte).
 * Lesezugriff für Admin und Trainer (FR-2i).
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireAnyRole(user, 'admin', 'trainer')
  return teamTagsService.listAll()
})
