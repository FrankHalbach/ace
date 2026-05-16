import { describe, expect, it } from 'vitest'
import {
  InvalidSetsError,
  validateSetsForMode,
  verifyWinnerConsistency,
} from '../../server/shared/match-scoring'

describe('validateSetsForMode — Anzahl Sätze', () => {
  it('lehnt leere Set-Liste ab', () => {
    expect(() => validateSetsForMode('best-of-3-champions', [])).toThrow(InvalidSetsError)
  })

  it('Pro-Set: genau ein Satz erforderlich', () => {
    expect(() =>
      validateSetsForMode('pro-set', [{ a: 8, b: 6 }, { a: 8, b: 4 }]),
    ).toThrow(/genau ein Satz/i)
  })

  it('Best-of-3 verlangt 2 oder 3 Sätze', () => {
    expect(() => validateSetsForMode('best-of-3-champions', [{ a: 6, b: 4 }])).toThrow(
      /2 oder 3 Sätze/i,
    )
  })

  it('Unentschieden pro Satz ist verboten', () => {
    expect(() =>
      validateSetsForMode('best-of-3-full', [{ a: 6, b: 6 }, { a: 6, b: 4 }]),
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
      validateSetsForMode('best-of-3-full', [
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
      validateSetsForMode('best-of-3-full', [
        { a, b },
        { a: 6, b: 1 },
      ]),
    ).toThrow(InvalidSetsError)
  })
})

describe('validateSetsForMode — Match-Tie-Break als Decider (A2)', () => {
  it('two-sets-match-tiebreak: 3. Satz muss Match-TB sein', () => {
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
      validateSetsForMode('best-of-3-champions', [
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
      validateSetsForMode('best-of-3-champions', [
        { a: 6, b: 4 },
        { a: 2, b: 6 },
        { a, b },
      ]),
    ).toThrow(/Match-Tie-Break/i)
  })

  it('best-of-3-tiebreak: 3. Satz ist regulär, kein Match-TB', () => {
    // Im Modus mit regulärem 3. Satz darf 6:4 stehen.
    expect(() =>
      validateSetsForMode('best-of-3-tiebreak', [
        { a: 6, b: 4 },
        { a: 2, b: 6 },
        { a: 6, b: 4 },
      ]),
    ).not.toThrow()
    // Match-TB-Score (10:8) ist im 3. Satz von best-of-3-tiebreak NICHT zulässig.
    expect(() =>
      validateSetsForMode('best-of-3-tiebreak', [
        { a: 6, b: 4 },
        { a: 2, b: 6 },
        { a: 10, b: 8 },
      ]),
    ).toThrow(InvalidSetsError)
  })
})

describe('validateSetsForMode — Short-Set (short-sets-tiebreak)', () => {
  it.each([
    [4, 0],
    [4, 1],
    [4, 2],
    [5, 3],
    [5, 4],
    [0, 4],
    [4, 5],
  ])('akzeptiert Short-Set %i:%i', (a, b) => {
    expect(() =>
      validateSetsForMode('short-sets-tiebreak', [
        { a, b },
        { a: 4, b: 1 },
      ]),
    ).not.toThrow()
  })

  it.each([
    [6, 4],
    [4, 3],
    [5, 5],
    [5, 2],
    [3, 1],
  ])('lehnt Short-Set %i:%i ab', (a, b) => {
    expect(() =>
      validateSetsForMode('short-sets-tiebreak', [
        { a, b },
        { a: 4, b: 1 },
      ]),
    ).toThrow(InvalidSetsError)
  })
})

describe('validateSetsForMode — Pro-Set (A3)', () => {
  it.each([
    [8, 0],
    [8, 1],
    [8, 6],
    [9, 8],
  ])('Länge 8: akzeptiert %i:%i', (a, b) => {
    expect(() => validateSetsForMode('pro-set', [{ a, b }], { proSetLength: 8 })).not.toThrow()
  })

  it.each([
    [8, 7],
    [9, 7],
    [12, 7],
    [4, 1],
  ])('Länge 8: lehnt %i:%i ab', (a, b) => {
    expect(() => validateSetsForMode('pro-set', [{ a, b }], { proSetLength: 8 })).toThrow(
      InvalidSetsError,
    )
  })

  it.each([
    [9, 0],
    [9, 7],
    [10, 9],
  ])('Länge 9: akzeptiert %i:%i', (a, b) => {
    expect(() => validateSetsForMode('pro-set', [{ a, b }], { proSetLength: 9 })).not.toThrow()
  })

  it.each([
    [9, 8],
    [10, 8],
    [11, 9],
  ])('Länge 9: lehnt %i:%i ab', (a, b) => {
    expect(() => validateSetsForMode('pro-set', [{ a, b }], { proSetLength: 9 })).toThrow(
      InvalidSetsError,
    )
  })

  it('Default-Länge ist 8 (kein options-Parameter)', () => {
    expect(() => validateSetsForMode('pro-set', [{ a: 8, b: 6 }])).not.toThrow()
    expect(() => validateSetsForMode('pro-set', [{ a: 9, b: 7 }])).toThrow(InvalidSetsError)
  })

  it('Fehlermeldung nennt die erwartete Länge', () => {
    expect(() => validateSetsForMode('pro-set', [{ a: 9, b: 7 }], { proSetLength: 8 })).toThrow(
      /Länge 8/,
    )
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
