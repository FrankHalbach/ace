import {
  auditLogQueryInput,
  auditService,
  InvalidAuditCursorError,
} from '../../modules/admin'
import { requireAnyRole } from '../../shared/require-role'

/**
 * GET /api/admin/audit-log — filterbarer Audit-Log (Design-Doc admin).
 *
 * Auth: admin oder trainer (Trainer dürfen lesen, um eigene
 * Dispute-Entscheidungen nachvollziehen zu können).
 *
 * Query-Parameter:
 *   - action, actorId, subjectKind, subjectId
 *   - from, to (ISO oder Millis)
 *   - cursor (opaker Token aus vorheriger Response)
 *   - limit (Default 50, max 200)
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireAnyRole(user, 'admin', 'trainer')

  const raw = getQuery(event)
  const query = auditLogQueryInput.parse(raw)
  try {
    return auditService.listFiltered(query)
  } catch (err) {
    if (err instanceof InvalidAuditCursorError) {
      throw createError({ statusCode: 400, statusMessage: 'audit.invalid-cursor' })
    }
    throw err
  }
})
