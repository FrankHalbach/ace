import {
  CannotRemoveLastAdminError,
  MemberNotFoundError,
  MustKeepPlayerRoleError,
  memberAdminService,
  setRolesInput,
  type MemberId,
} from '../../../../modules/members'
import { requireRole } from '../../../../shared/require-role'
import { requirePublicIdParam } from '../../../../shared/public-id'

/**
 * PATCH /api/admin/members/:id/roles — Rollen-Zuweisung (FR-62).
 * Admin-only. Erzwingt: mindestens `player`-Rolle, mindestens ein
 * aktiver Admin im System.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')

  const id = requirePublicIdParam<MemberId>(event, 'id')
  const body = await readValidatedBody(event, setRolesInput.parse)
  try {
    return memberAdminService.setRoles(id, body.roles, user.memberId)
  } catch (err) {
    if (err instanceof MemberNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'member.not-found' })
    }
    if (err instanceof MustKeepPlayerRoleError) {
      throw createError({
        statusCode: 422,
        statusMessage: 'member.must-keep-player-role',
      })
    }
    if (err instanceof CannotRemoveLastAdminError) {
      throw createError({
        statusCode: 422,
        statusMessage: 'member.cannot-remove-last-admin',
      })
    }
    throw err
  }
})
