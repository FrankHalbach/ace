import { describe, expect, it } from 'vitest'
import { strategyFor } from '../../server/modules/rankings/strategy'
import type { MemberDto, MemberId } from '../../server/modules/members'

function makeMember(id: number, dtbLk: number, gender: 'm' | 'w' = 'm'): MemberDto {
  return {
    id: id as MemberId,
    email: `m${id}@x.de`,
    firstName: `M${id}`,
    lastName: 'X',
    birthYear: 1990,
    gender,
    dtbLk,
    status: 'aktiv',
    roles: ['player'],
    preferences: {
      singlesChallenges: true,
      singlesFriendly: true,
      doublesFriendly: false,
      mixedFriendly: false,
      seniorsFriendly: false,
    },
  }
}

describe('PyramidStrategy', () => {
  const strategy = strategyFor('pyramid')

  it('defaultConfig liefert maxJumpUp', () => {
    expect(strategy.defaultConfig()).toEqual({ maxJumpUp: 3 })
  })

  it('reset: sortiert ausschließlich nach LK aufsteigend', () => {
    const members = [makeMember(1, 12), makeMember(2, 8), makeMember(3, 15)]
    const order = strategy.getInitialOrder({ members, transition: 'reset' })
    expect(order).toEqual([2, 1, 3])
  })

  it('takeover: Vorgänger-Reihenfolge plus Newcomer ans Ende nach LK', () => {
    const members = [makeMember(1, 12), makeMember(2, 8), makeMember(3, 15)]
    const previousEntries = [
      { memberId: 2 as MemberId, position: 1 },
      { memberId: 1 as MemberId, position: 2 },
    ]
    const order = strategy.getInitialOrder({ members, transition: 'takeover', previousEntries })
    expect(order).toEqual([2, 1, 3]) // 3 ist Newcomer
  })

  it('softened: Top-5 fix, Rest nach LK', () => {
    const members = Array.from({ length: 8 }, (_, i) => makeMember(i + 1, 20 - i))
    const previousEntries = Array.from({ length: 8 }, (_, i) => ({
      memberId: ((i + 1) % 8 + 1) as MemberId,
      position: i + 1,
    }))
    const order = strategy.getInitialOrder({ members, transition: 'softened', previousEntries })
    // Erste 5 sind die Top-5 aus previousEntries
    expect(order.slice(0, 5)).toEqual(previousEntries.slice(0, 5).map((e) => e.memberId))
  })

  it('initialEntryFields: points und eloRating sind null', () => {
    const fields = strategy.initialEntryFields(makeMember(1, 10))
    expect(fields).toEqual({ points: null, eloRating: null })
  })

  it('getDisplayInfo: Position als #', () => {
    expect(strategy.getDisplayInfo({ position: 5, points: null, eloRating: null })).toEqual({ primary: '#5' })
  })
})

describe('EloStrategy', () => {
  const strategy = strategyFor('elo')

  it('initialEntryFields: ELO startet bei 1500', () => {
    const fields = strategy.initialEntryFields(makeMember(1, 10))
    expect(fields).toEqual({ points: null, eloRating: 1500 })
  })

  it('getDisplayInfo: Position und Rating', () => {
    expect(strategy.getDisplayInfo({ position: 3, points: null, eloRating: 1567.4 })).toEqual({
      primary: '#3',
      secondary: '1567 ELO',
    })
  })
})

describe('HybridStrategy', () => {
  const strategy = strategyFor('hybrid')

  it('defaultConfig: maxJumpUp + kFactor', () => {
    expect(strategy.defaultConfig()).toEqual({ maxJumpUp: 3, kFactor: 16 })
  })

  it('initialEntryFields: ELO bei 1500, points null', () => {
    expect(strategy.initialEntryFields(makeMember(1, 10))).toEqual({ points: null, eloRating: 1500 })
  })
})

describe('PointsTableStrategy', () => {
  const strategy = strategyFor('points-table')

  it('defaultConfig: alle Punktwerte aus N-01', () => {
    const config = strategy.defaultConfig()
    expect(config.pointValues?.challengeWin).toBe(3)
    expect(config.pointValues?.challengeLoss).toBe(1)
    expect(config.pointValues?.diversityBonus).toBe(1)
  })

  it('initialEntryFields: points startet bei 0', () => {
    expect(strategy.initialEntryFields(makeMember(1, 10))).toEqual({ points: 0, eloRating: null })
  })

  it('getDisplayInfo: Punkte primär, Position sekundär', () => {
    expect(strategy.getDisplayInfo({ position: 7, points: 15, eloRating: null })).toEqual({
      primary: '15 Pkt',
      secondary: '#7',
    })
  })

  it('initialOrder: sortiert nach LK (Punkte starten bei 0)', () => {
    const members = [makeMember(1, 12), makeMember(2, 8), makeMember(3, 15)]
    const order = strategy.getInitialOrder({ members, transition: 'reset' })
    expect(order).toEqual([2, 1, 3])
  })
})
