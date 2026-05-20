import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { profileService, type MemberId } from '../../server/modules/members'
import { notifyService } from '../../server/modules/notifications'
import { createTestDb } from '../helpers/test-db'

// Wir spionieren den Transport-Aufruf — nicht den Dispatcher selbst —
// damit die ganze Render-Pipeline mitläuft.
const sendEmailMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../../server/shared/email-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/shared/email-transport')>()
  return {
    ...actual,
    sendEmail: (...args: Parameters<typeof actual.sendEmail>) => sendEmailMock(...args),
  }
})

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())
afterEach(() => sendEmailMock.mockClear())

function insertMember(opts: {
  email: string
  firstName: string
  prefs?: Partial<Record<string, boolean>>
  deactivated?: boolean
}): MemberId {
  const row = useDb()
    .insert(member)
    .values({
      email: opts.email,
      firstName: opts.firstName,
      lastName: 'X',
      birthYear: 1990,
      gender: 'm',
      dtbLk: 10,
      ...(opts.prefs
        ? {
            notificationPrefs: {
              'challenge.received': true,
              'challenge.accepted': true,
              'challenge.declined': true,
              'challenge.expired': true,
              'challenge.result_reported': true,
              'challenge.result_confirmed': true,
              'challenge.result_disputed': true,
              'friendly.invited': true,
              'friendly.accepted': true,
              'friendly.declined': true,
              'friendly.cancelled': true,
              'friendly.result_reported': true,
              'friendly.result_confirmed': true,
              'friendly.result_disputed': true,
              ...opts.prefs,
            },
          }
        : {}),
      ...(opts.deactivated ? { deactivatedAt: new Date() } : {}),
    })
    .returning()
    .get()
  return row!.id
}

describe('notifyService.dispatch', () => {
  it('versendet eine Mail an einen aktiven Empfänger mit dem Default-Pref', async () => {
    const recipient = insertMember({ email: 'recv@x.de', firstName: 'Recv' })
    const challenger = insertMember({ email: 'chl@x.de', firstName: 'Chal' })

    await notifyService.dispatch({
      key: 'challenge.received',
      recipientId: recipient,
      challengeId: 'challenge-0001' as never,
      challengerId: challenger,
      rankingName: 'Herren 40',
    })

    expect(sendEmailMock).toHaveBeenCalledOnce()
    const arg = sendEmailMock.mock.calls[0]![0]
    expect(arg.to.email).toBe('recv@x.de')
    expect(arg.subject).toContain('Neue Herausforderung')
    expect(arg.subject).toContain('Chal X')
    expect(arg.html).toContain('Herren 40')
    expect(arg.kind).toBe('challenge.received')
  })

  it('überspringt deaktivierte Empfänger', async () => {
    const recipient = insertMember({ email: 'r@x.de', firstName: 'R', deactivated: true })
    const challenger = insertMember({ email: 'c@x.de', firstName: 'C' })

    await notifyService.dispatch({
      key: 'challenge.received',
      recipientId: recipient,
      challengeId: 'c-1' as never,
      challengerId: challenger,
      rankingName: 'Herren',
    })

    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('überspringt Empfänger mit Notif-Toggle aus', async () => {
    const recipient = insertMember({
      email: 'r@x.de',
      firstName: 'R',
      prefs: { 'challenge.received': false },
    })
    const challenger = insertMember({ email: 'c@x.de', firstName: 'C' })

    await notifyService.dispatch({
      key: 'challenge.received',
      recipientId: recipient,
      challengeId: 'c-1' as never,
      challengerId: challenger,
      rankingName: 'Herren',
    })

    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('schluckt Transport-Fehler — Caller bekommt keinen Throw', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('SMTP down'))
    const recipient = insertMember({ email: 'r@x.de', firstName: 'R' })
    const challenger = insertMember({ email: 'c@x.de', firstName: 'C' })

    await expect(
      notifyService.dispatch({
        key: 'challenge.received',
        recipientId: recipient,
        challengeId: 'c-1' as never,
        challengerId: challenger,
        rankingName: 'Herren',
      }),
    ).resolves.toBeUndefined()
  })

  it('rendert Friendly-Invite mit Termin im Subject-Bereich', async () => {
    const recipient = insertMember({ email: 'r@x.de', firstName: 'Anna' })
    const initiator = insertMember({ email: 'i@x.de', firstName: 'Bert' })

    await notifyService.dispatch({
      key: 'friendly.invited',
      recipientId: recipient,
      friendlyId: 'f-1' as never,
      initiatorId: initiator,
      format: 'doubles',
      scheduledAt: new Date('2026-06-15T18:00:00Z'),
    })

    const arg = sendEmailMock.mock.calls[0]![0]
    expect(arg.subject).toContain('Doppel-Einladung von Bert X')
    expect(arg.html).toContain('Bert X')
    expect(arg.text).toContain('Termin')
  })

  it('escapt User-Eingaben im HTML', async () => {
    const recipient = insertMember({ email: 'r@x.de', firstName: 'R' })
    const challenger = useDb()
      .insert(member)
      .values({
        email: 'evil@x.de',
        firstName: '<script>alert("xss")</script>',
        lastName: 'Y',
        birthYear: 1990,
        gender: 'm',
        dtbLk: 10,
      })
      .returning()
      .get()!

    await notifyService.dispatch({
      key: 'challenge.received',
      recipientId: recipient,
      challengeId: 'c-1' as never,
      challengerId: challenger.id,
      rankingName: 'Herren',
    })

    const arg = sendEmailMock.mock.calls[0]![0]
    expect(arg.html).not.toContain('<script>alert')
    expect(arg.html).toContain('&lt;script&gt;')
  })

  it('liefert nichts, wenn der Empfänger fehlt — schweigt statt zu werfen', async () => {
    await expect(
      notifyService.dispatch({
        key: 'challenge.received',
        recipientId: 'unknown-1234567890ab' as MemberId,
        challengeId: 'c-1' as never,
        challengerId: 'unknown-other-12345' as MemberId,
        rankingName: 'Herren',
      }),
    ).resolves.toBeUndefined()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})

describe('profileService.findRecipient', () => {
  it('liefert Default-Prefs alle auf true für ein neues Mitglied', () => {
    const id = insertMember({ email: 'a@x.de', firstName: 'A' })
    const r = profileService.findRecipient(id)
    expect(r).toBeDefined()
    expect(r!.prefs['challenge.received']).toBe(true)
    expect(r!.prefs['friendly.invited']).toBe(true)
    expect(r!.isActive).toBe(true)
  })

  it('mergt partielle Notif-Prefs beim PATCH', () => {
    const id = insertMember({ email: 'a@x.de', firstName: 'A' })
    profileService.updateOwnProfile(id, {
      notificationPrefs: { 'challenge.received': false },
    })
    const r = profileService.findRecipient(id)!
    expect(r.prefs['challenge.received']).toBe(false)
    // Andere Keys bleiben bei den Default-true-Werten.
    expect(r.prefs['friendly.invited']).toBe(true)
    expect(r.prefs['challenge.accepted']).toBe(true)
  })
})
