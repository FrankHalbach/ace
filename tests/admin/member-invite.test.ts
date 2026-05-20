import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { magicLinkToken } from '../../server/db/schema/magic-link-token'
import { auditService } from '../../server/modules/admin'
import {
  MemberDeactivatedError,
  MemberNotFoundError,
  memberAdminService,
  type MemberId,
} from '../../server/modules/members'
import * as emailModule from '../../server/modules/auth/service/email'
import { INVITE_TOKEN_TTL_MS } from '../../server/modules/auth/service/token'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => {
  t.reset()
  vi.restoreAllMocks()
})

function insertMember(
  firstName: string,
  lastName: string,
  opts: { deactivated?: boolean; roles?: ('player' | 'admin' | 'trainer')[] } = {},
): MemberId {
  const row = useDb()
    .insert(member)
    .values({
      email: `${firstName}.${lastName}@x.de`.toLowerCase(),
      firstName,
      lastName,
      birthYear: 1990,
      gender: 'm',
      dtbLk: 10,
      roles: opts.roles ?? ['player'],
    })
    .returning()
    .get()
  if (opts.deactivated) {
    useDb()
      .update(member)
      .set({ deactivatedAt: new Date(), deactivationReason: 'austritt' })
      .where(eq(member.id, row!.id))
      .run()
  }
  return row!.id
}

describe('memberAdminService.invite', () => {
  it('legt einen 30-Tage-Token an und setzt invitedAt + invitedBy', async () => {
    vi.spyOn(emailModule, 'sendInviteEmail').mockResolvedValue(undefined)
    const actor = insertMember('Anna', 'Admin', { roles: ['player', 'admin'] })
    const target = insertMember('Neu', 'Spieler')
    const before = new Date()

    const result = await memberAdminService.invite(
      target,
      actor,
      'https://ace.example',
    )

    expect(result.emailSent).toBe(true)
    expect(result.fallbackLink).toBeUndefined()
    expect(result.member.invitedAt).toBeInstanceOf(Date)
    expect(result.member.invitedAt!.getTime()).toBeGreaterThanOrEqual(
      Math.floor(before.getTime() / 1000) * 1000,
    )

    const tokens = useDb()
      .select()
      .from(magicLinkToken)
      .where(eq(magicLinkToken.memberId, target))
      .all()
    expect(tokens).toHaveLength(1)
    const ttl = tokens[0]!.expiresAt.getTime() - tokens[0]!.createdAt.getTime()
    // Sekundengenau gerundet — Toleranz von 1s reicht.
    expect(Math.abs(ttl - INVITE_TOKEN_TTL_MS)).toBeLessThan(1500)
  })

  it('schreibt einen member.invited-Audit-Eintrag', async () => {
    vi.spyOn(emailModule, 'sendInviteEmail').mockResolvedValue(undefined)
    const actor = insertMember('Anna', 'Admin', { roles: ['player', 'admin'] })
    const target = insertMember('Neu', 'Spieler')

    await memberAdminService.invite(target, actor, 'https://ace.example')

    const log = auditService.listRecent().find((e) => e.action === 'member.invited')
    expect(log).toBeDefined()
    expect(log!.actorId).toBe(actor)
    expect(log!.subjectId).toBe(target)
    expect(log!.before).toEqual({ invitedAt: null, invitedBy: null })
  })

  it('ruft sendInviteEmail mit Inviter-Name und Link auf', async () => {
    const spy = vi.spyOn(emailModule, 'sendInviteEmail').mockResolvedValue(undefined)
    const actor = insertMember('Anna', 'Admin', { roles: ['player', 'admin'] })
    const target = insertMember('Neu', 'Spieler')

    await memberAdminService.invite(target, actor, 'https://ace.example/')

    expect(spy).toHaveBeenCalledOnce()
    const arg = spy.mock.calls[0]![0]
    expect(arg.to.email).toBe('neu.spieler@x.de')
    expect(arg.to.firstName).toBe('Neu')
    expect(arg.inviterName).toBe('Anna Admin')
    // Trailing slash am baseUrl wird entfernt
    expect(arg.link).toMatch(/^https:\/\/ace\.example\/api\/auth\/confirm\/[a-f0-9]{64}$/)
  })

  it('liefert fallbackLink, wenn der E-Mail-Versand fehlschlägt', async () => {
    vi.spyOn(emailModule, 'sendInviteEmail').mockRejectedValue(
      new Error('SMTP 500'),
    )
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const actor = insertMember('Anna', 'Admin', { roles: ['player', 'admin'] })
    const target = insertMember('Neu', 'Spieler')

    const result = await memberAdminService.invite(
      target,
      actor,
      'https://ace.example',
    )

    expect(result.emailSent).toBe(false)
    expect(result.fallbackLink).toMatch(/^https:\/\/ace\.example\/api\/auth\/confirm\//)
    // invitedAt + Audit werden trotzdem geschrieben
    expect(result.member.invitedAt).toBeInstanceOf(Date)
    const log = auditService.listRecent().find((e) => e.action === 'member.invited')
    expect(log).toBeDefined()
  })

  it('erlaubt wiederholtes Einladen — neuer Token, invitedAt überschrieben', async () => {
    vi.spyOn(emailModule, 'sendInviteEmail').mockResolvedValue(undefined)
    const actor = insertMember('Anna', 'Admin', { roles: ['player', 'admin'] })
    const target = insertMember('Neu', 'Spieler')
    const firstTime = new Date('2026-01-01T10:00:00Z')
    const secondTime = new Date('2026-02-01T10:00:00Z')

    await memberAdminService.invite(target, actor, 'https://ace.example', firstTime)
    await memberAdminService.invite(target, actor, 'https://ace.example', secondTime)

    const tokens = useDb()
      .select()
      .from(magicLinkToken)
      .where(eq(magicLinkToken.memberId, target))
      .all()
    expect(tokens).toHaveLength(2)

    const updated = useDb().select().from(member).where(eq(member.id, target)).get()!
    expect(updated.invitedAt!.getTime()).toBe(secondTime.getTime())
  })

  it('wirft MemberNotFoundError für unbekanntes Mitglied', async () => {
    const actor = insertMember('Anna', 'Admin', { roles: ['player', 'admin'] })
    await expect(
      memberAdminService.invite('xxxxxxxxxxxxxxxxx' as MemberId, actor, 'https://x'),
    ).rejects.toThrowError(MemberNotFoundError)
  })

  it('wirft MemberDeactivatedError für deaktiviertes Mitglied', async () => {
    const actor = insertMember('Anna', 'Admin', { roles: ['player', 'admin'] })
    const target = insertMember('Raus', 'Aus', { deactivated: true })
    await expect(
      memberAdminService.invite(target, actor, 'https://x'),
    ).rejects.toThrowError(MemberDeactivatedError)
  })

  it('aktualisiert keinen Member, wenn der Inviter unbekannt ist', async () => {
    const target = insertMember('Neu', 'Spieler')
    await expect(
      memberAdminService.invite(target, 'xxxxxxxxxxxxxxxxx' as MemberId, 'https://x'),
    ).rejects.toThrowError(MemberNotFoundError)

    const reloaded = useDb()
      .select()
      .from(member)
      .where(eq(member.id, target))
      .get()!
    expect(reloaded.invitedAt).toBeNull()
    expect(reloaded.invitedBy).toBeNull()

    const tokens = useDb()
      .select()
      .from(magicLinkToken)
      .where(eq(magicLinkToken.memberId, target))
      .all()
    expect(tokens).toHaveLength(0)
  })
})
