import { describe, expect, it } from 'vitest'
import { strategyFor } from '../../server/modules/rankings/strategy'
import type { RankingEntryRow } from '../../server/db/schema/ranking-entry'
import type { MemberId } from '../../server/modules/members'

function makeEntry(overrides: Partial<RankingEntryRow> = {}): RankingEntryRow {
  return {
    id: 1,
    rankingId: 1,
    memberId: '1' as MemberId,
    position: 1,
    points: null,
    eloRating: null,
    lastMatchAt: null,
    ...overrides,
  } as RankingEntryRow
}

describe('PyramidStrategy.validateChallenge', () => {
  const strategy = strategyFor('pyramid')

  it('Challenger über Challenged ist erlaubt innerhalb Sprung-Distanz', () => {
    const result = strategy.validateChallenge({
      challengerEntry: makeEntry({ id: 1, position: 5 }),
      challengedEntry: makeEntry({ id: 2, position: 3 }),
      config: { maxJumpUp: 3 },
    })
    expect(result.ok).toBe(true)
  })

  it('Sprung zu hoch wird abgelehnt', () => {
    const result = strategy.validateChallenge({
      challengerEntry: makeEntry({ id: 1, position: 10 }),
      challengedEntry: makeEntry({ id: 2, position: 3 }),
      config: { maxJumpUp: 3 },
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.code).toBe('jump-not-allowed')
  })

  it('Challenger unter Challenged (= besserer Rank) wird abgelehnt', () => {
    const result = strategy.validateChallenge({
      challengerEntry: makeEntry({ id: 1, position: 2 }),
      challengedEntry: makeEntry({ id: 2, position: 5 }),
      config: { maxJumpUp: 3 },
    })
    expect(result.ok).toBe(false)
  })
})

describe('PyramidStrategy.applyResult', () => {
  const strategy = strategyFor('pyramid')

  it('Sieger Challenger: Position-Tausch, alle dazwischen rutschen runter', () => {
    const allEntries = [
      makeEntry({ id: 1, memberId: '10' as MemberId, position: 1 }),
      makeEntry({ id: 2, memberId: '20' as MemberId, position: 2 }),
      makeEntry({ id: 3, memberId: '30' as MemberId, position: 3 }), // Challenged
      makeEntry({ id: 4, memberId: '40' as MemberId, position: 4 }),
      makeEntry({ id: 5, memberId: '50' as MemberId, position: 5 }), // Challenger
    ]
    const mutations = strategy.applyResult({
      winnerId: '50' as MemberId,
      loserId: '30' as MemberId,
      challengerEntry: allEntries[4],
      challengedEntry: allEntries[2],
      allEntries,
      config: { maxJumpUp: 3 },
      now: new Date(),
    })

    const positionMutations = mutations.filter((m) => m.kind === 'set-position')
    // Challenger geht auf Pos 3, Pos-3 und 4 rutschen auf 4 und 5
    expect(positionMutations).toEqual(
      expect.arrayContaining([
        { kind: 'set-position', entryId: 5, position: 3 },
        { kind: 'set-position', entryId: 3, position: 4 },
        { kind: 'set-position', entryId: 4, position: 5 },
      ]),
    )
  })

  it('Sieger Challenged: keine Positions-Änderung, nur lastMatchAt', () => {
    const allEntries = [
      makeEntry({ id: 1, memberId: '10' as MemberId, position: 1 }),
      makeEntry({ id: 2, memberId: '20' as MemberId, position: 2 }),
    ]
    const mutations = strategy.applyResult({
      winnerId: '10' as MemberId,
      loserId: '20' as MemberId,
      challengerEntry: allEntries[1],
      challengedEntry: allEntries[0],
      allEntries,
      config: { maxJumpUp: 3 },
      now: new Date(),
    })
    const positionMutations = mutations.filter((m) => m.kind === 'set-position')
    expect(positionMutations).toHaveLength(0)
    const lastMatchMutations = mutations.filter((m) => m.kind === 'set-last-match')
    expect(lastMatchMutations).toHaveLength(2)
  })
})

describe('EloStrategy.applyResult', () => {
  const strategy = strategyFor('elo')

  it('Sieger gewinnt Rating, Verlierer verliert Rating', () => {
    const allEntries = [
      makeEntry({ id: 1, memberId: '10' as MemberId, position: 1, eloRating: 1500 }),
      makeEntry({ id: 2, memberId: '20' as MemberId, position: 2, eloRating: 1500 }),
    ]
    const mutations = strategy.applyResult({
      winnerId: '20' as MemberId,
      loserId: '10' as MemberId,
      challengerEntry: allEntries[1],
      challengedEntry: allEntries[0],
      allEntries,
      config: { kFactor: 32 },
      now: new Date(),
    })
    const eloMuts = mutations.filter((m) => m.kind === 'set-elo')
    expect(eloMuts).toHaveLength(2)
    // Bei gleichen Ratings: 1500 + 32*0.5 = 1516 für Sieger, 1500 - 16 = 1484 für Verlierer
    const winnerElo = eloMuts.find((m) => m.kind === 'set-elo' && m.entryId === 2)!
    const loserElo = eloMuts.find((m) => m.kind === 'set-elo' && m.entryId === 1)!
    expect(winnerElo.kind === 'set-elo' && winnerElo.eloRating).toBe(1516)
    expect(loserElo.kind === 'set-elo' && loserElo.eloRating).toBe(1484)
  })
})

describe('PointsTableStrategy.applyResult', () => {
  const strategy = strategyFor('points-table')

  it('Sieger bekommt mehr Punkte als Verlierer, Positionen neu sortiert', () => {
    const allEntries = [
      makeEntry({ id: 1, memberId: '10' as MemberId, position: 1, points: 5 }),
      makeEntry({ id: 2, memberId: '20' as MemberId, position: 2, points: 2 }),
      makeEntry({ id: 3, memberId: '30' as MemberId, position: 3, points: 0 }),
    ]
    const mutations = strategy.applyResult({
      winnerId: '30' as MemberId, // Niedrigster Rang gewinnt
      loserId: '10' as MemberId,
      challengerEntry: allEntries[2], // #3 fordert #1
      challengedEntry: allEntries[0],
      allEntries,
      config: strategy.defaultConfig(),
      now: new Date(),
    })
    const pointsMuts = mutations.filter((m) => m.kind === 'set-points')
    expect(pointsMuts.find((m) => m.kind === 'set-points' && m.entryId === 3)?.kind === 'set-points' &&
      (pointsMuts.find((m) => m.kind === 'set-points' && m.entryId === 3) as { points: number }).points,
    ).toBe(3) // 0 + 3 (challengeWin)
    expect(pointsMuts.find((m) => m.kind === 'set-points' && m.entryId === 1)?.kind === 'set-points' &&
      (pointsMuts.find((m) => m.kind === 'set-points' && m.entryId === 1) as { points: number }).points,
    ).toBe(6) // 5 + 1 (challengeLoss)

    const awards = mutations.filter((m) => m.kind === 'award-points')
    expect(awards).toHaveLength(2)
  })
})
