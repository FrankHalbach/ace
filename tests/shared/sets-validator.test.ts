import { describe, expect, it } from 'vitest'
import {
  InvalidSetsError,
  validateSetsForMode,
  verifyWinnerConsistency,
} from '../../shared/match-scoring'

describe('validateSetsForMode — Anzahl Sätze', () => {
  it('lehnt leere Set-Liste ab', () => {
    expect(() => validateSetsForMode('two-sets-match-tiebreak', [])).toThrow(InvalidSetsError)
  })

  it('verlangt 2 oder 3 Sätze', () => {
    expect(() => validateSetsForMode('two-sets-match-tiebreak', [{ a: 6, b: 4 }])).toThrow(
      /2 oder 3 Sätze/i,
    )
  })

  it('Unentschieden pro Satz ist verboten', () => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [{ a: 6, b: 6 }, { a: 6, b: 4 }]),
    ).toThrow(/Unentschieden/i)
  })
})

describe('validateSetsForMode — regulärer Satz (A1)', () => {
  it.each([
    [6, 0],
    [6, 1],
    [6, 2],
    [6, 3],
    [6, 4],
    [7, 5],
    [7, 6],
    [0, 6],
    [4, 6],
    [6, 7],
  ])('akzeptiert %i:%i', (a, b) => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [
        { a, b },
        { a: 6, b: 1 },
      ]),
    ).not.toThrow()
  })

  it.each([
    [5, 5],
    [6, 5],
    [7, 7],
    [8, 6],
    [9, 7],
    [20, 0],
    [3, 1],
  ])('lehnt %i:%i ab', (a, b) => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [
        { a, b },
        { a: 6, b: 1 },
      ]),
    ).toThrow(InvalidSetsError)
  })
})

describe('validateSetsForMode — Match-Tie-Break als Decider (A2)', () => {
  it('3. Satz muss Match-TB sein', () => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [
        { a: 6, b: 4 },
        { a: 2, b: 6 },
        { a: 10, b: 8 },
      ]),
    ).not.toThrow()
  })

  it.each([
    [10, 8],
    [12, 10],
    [15, 13],
    [10, 0],
  ])('akzeptiert Match-TB %i:%i', (a, b) => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [
        { a: 6, b: 4 },
        { a: 2, b: 6 },
        { a, b },
      ]),
    ).not.toThrow()
  })

  it.each([
    [7, 5],
    [10, 9],
    [6, 4],
    [9, 7],
  ])('lehnt %i:%i als Match-TB ab', (a, b) => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [
        { a: 6, b: 4 },
        { a: 2, b: 6 },
        { a, b },
      ]),
    ).toThrow(/Match-Tie-Break/i)
  })
})

describe('validateSetsForMode — Walk-Over (#29)', () => {
  it('akzeptiert leere sets bei outcome=walkover', () => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [], { outcome: 'walkover' }),
    ).not.toThrow()
  })

  it('lehnt nicht-leere sets bei outcome=walkover ab', () => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [{ a: 6, b: 4 }, { a: 6, b: 2 }], {
        outcome: 'walkover',
      }),
    ).toThrow(/Walk-Over/i)
  })
})

describe('validateSetsForMode — Aufgabe (#30)', () => {
  it('akzeptiert unvollständigen letzten Satz bei outcome=retirement', () => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [{ a: 6, b: 2 }, { a: 3, b: 1 }], {
        outcome: 'retirement',
      }),
    ).not.toThrow()
  })

  it('akzeptiert auch einen einzigen unvollständigen Satz', () => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [{ a: 2, b: 1 }], {
        outcome: 'retirement',
      }),
    ).not.toThrow()
  })

  it('verlangt mindestens einen angespielten Satz bei retirement', () => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [], { outcome: 'retirement' }),
    ).toThrow(/Mindestens ein Satz/i)
  })

  it('lehnt unvollständigen Satz NICHT-am-Ende auch bei retirement ab', () => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [{ a: 3, b: 1 }, { a: 6, b: 2 }], {
        outcome: 'retirement',
      }),
    ).toThrow(InvalidSetsError)
  })

  it('vollständiger letzter Satz bei retirement ist auch ok', () => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [{ a: 6, b: 2 }, { a: 4, b: 6 }], {
        outcome: 'retirement',
      }),
    ).not.toThrow()
  })

  it('Unentschieden im letzten Satz ist trotzdem verboten', () => {
    expect(() =>
      validateSetsForMode('two-sets-match-tiebreak', [{ a: 6, b: 2 }, { a: 2, b: 2 }], {
        outcome: 'retirement',
      }),
    ).toThrow(/Unentschieden/i)
  })

  it('unvollständiger Match-TB als 3. Satz ist bei retirement zulässig', () => {
    expect(() =>
      validateSetsForMode(
        'two-sets-match-tiebreak',
        [{ a: 6, b: 4 }, { a: 4, b: 6 }, { a: 5, b: 3 }],
        { outcome: 'retirement' },
      ),
    ).not.toThrow()
  })
})

describe('verifyWinnerConsistency', () => {
  it('akzeptiert konsistenten Sieger', () => {
    expect(() =>
      verifyWinnerConsistency([{ a: 6, b: 4 }, { a: 6, b: 3 }], true),
    ).not.toThrow()
  })

  it('lehnt inkonsistenten Sieger ab', () => {
    expect(() =>
      verifyWinnerConsistency([{ a: 6, b: 4 }, { a: 6, b: 3 }], false),
    ).toThrow(/Inkonsistenz/i)
  })

  it('Friendly-Variante nennt "Sieger-Team"', () => {
    expect(() =>
      verifyWinnerConsistency([{ a: 6, b: 4 }, { a: 6, b: 3 }], false, { winnerSubject: 'team' }),
    ).toThrow(/Sieger-Team/i)
  })
})
