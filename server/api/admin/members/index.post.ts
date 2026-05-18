import {
  MemberDuplicateEmailError,
  createMemberInput,
  memberAdminService,
} from '../../../modules/members'
import { requireRole } from '../../../shared/require-role'

/**
 * POST /api/admin/members — Mitglied manuell anlegen (FR-60 Single-Variante).
 * Admin-only. Default-Rolle ist `player`. Email muss eindeutig sein.
 * Einladung wird separat versendet (Folge-Endpoint).
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')

  const body = await readValidatedBody(event, createMemberInput.parse)
  try {
    return memberAdminService.create(body, user.memberId)
  } catch (err) {
    if (err instanceof MemberDuplicateEmailError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'member.duplicate-email',
      })
    }
    throw err
  }
})
