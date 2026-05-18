import { z } from 'zod'
import {
  TeamTagInactiveError,
  TeamTagNotFoundError,
  teamTagsService,
  type TeamTagId,
} from '../../../modules/team-tags'
import type { MemberId } from '../../../modules/members'
import { requireAnyRole } from '../../../shared/require-role'
import { requirePublicIdParam } from '../../../shared/public-id'

const bodySchema = z.object({ memberId: z.string().min(1) })

/**
 * POST /api/team-tags/:id/members — Spieler einer Mannschaft hinzufuegen.
 * Idempotent: doppelt zugewiesen wird nicht doppelt geschrieben.
 * Antwortet mit der vollstaendigen Mitgliederliste der Mannschaft.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireAnyRole(user, 'admin', 'trainer')

  const id = requirePublicIdParam<TeamTagId>(event, 'id')
  const body = await readValidatedBody(event, bodySchema.parse)
  try {
    return teamTagsService.addMember(id, body.memberId as MemberId, user.memberId)
  } catch (err) {
    if (err instanceof TeamTagNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'team-tag.not-found' })
    }
    if (err instanceof TeamTagInactiveError) {
      throw createError({ statusCode: 422, statusMessage: 'team-tag.inactive' })
    }
    throw err
  }
})
