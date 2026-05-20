import { describe, expect, it } from 'vitest'
import { evaluateSessionRefresh } from '../../server/modules/auth'
import type { MemberId, Role } from '../../server/modules/members'

const memberId = 'mem_abc123' as MemberId

function session(roles: Role[]) {
  return { memberId, roles }
}

describe('evaluateSessionRefresh', () => {
  it('rejects, wenn der Member nicht mehr in der DB ist', () => {
    const r = evaluateSessionRefresh(session(['player']), undefined)
    expect(r).toEqual({ action: 'reject', reason: 'member-not-found' })
  })

  it('rejects admin-deaktivierte Mitglieder', () => {
    const r = evaluateSessionRefresh(session(['player']), {
      id: memberId,
      roles: ['player'],
      adminDeactivated: true,
    })
    expect(r).toEqual({ action: 'reject', reason: 'member-deactivated' })
  })

  it('passt, wenn die Rollen identisch sind', () => {
    const r = evaluateSessionRefresh(session(['player', 'admin']), {
      id: memberId,
      roles: ['player', 'admin'],
      adminDeactivated: false,
    })
    expect(r).toEqual({ action: 'pass' })
  })

  it('passt auch bei umsortierten Rollen — Reihenfolge ist egal', () => {
    const r = evaluateSessionRefresh(session(['admin', 'player']), {
      id: memberId,
      roles: ['player', 'admin'],
      adminDeactivated: false,
    })
    expect(r).toEqual({ action: 'pass' })
  })

  it('updated, wenn Session admin trägt, DB aber nicht (Demotion)', () => {
    const r = evaluateSessionRefresh(session(['player', 'admin']), {
      id: memberId,
      roles: ['player'],
      adminDeactivated: false,
    })
    expect(r).toEqual({
      action: 'update',
      user: { memberId, roles: ['player'] },
    })
  })

  it('updated, wenn DB neue Rolle trägt (Promotion)', () => {
    const r = evaluateSessionRefresh(session(['player']), {
      id: memberId,
      roles: ['player', 'trainer'],
      adminDeactivated: false,
    })
    expect(r).toEqual({
      action: 'update',
      user: { memberId, roles: ['player', 'trainer'] },
    })
  })
})
