/**
 * Validation de fin de match unifiée (#1829) : tableaux de cas.
 */
import { describe, it, expect } from 'vitest';
import {
  crossedSabreBreak,
  crossedScoreLimit,
  decideMatchWinner,
  isAcceptableScore,
  passivityWinner,
  resolveScoreLimit,
  validateMatchEnd,
  winnerByScore,
  type MatchEndInput,
  type MatchEndVerdict,
  type MatchWinner,
  type MatchWinnerInput,
} from './matchEndValidation';
import { getDefaultMaxScores } from './defaultMaxScores';
import { Category, Weapon } from '../types';

describe('validateMatchEnd (spécification Cyrano §4)', () => {
  const cases: Array<[string, MatchEndInput, MatchEndVerdict]> = [
    ['scores différents', { scoreA: 5, scoreB: 3 }, { ok: true }],
    ['scores différents (B)', { scoreA: 2, scoreB: 5 }, { ok: true }],
    [
      'égalité sans priorité',
      { scoreA: 4, scoreB: 4 },
      { ok: false, reason: 'tie_without_priority' },
    ],
    [
      'égalité 0-0 sans priorité',
      { scoreA: 0, scoreB: 0 },
      { ok: false, reason: 'tie_without_priority' },
    ],
    ['égalité avec priorité A', { scoreA: 4, scoreB: 4, priority: 'A' }, { ok: true }],
    ['égalité avec priorité B', { scoreA: 4, scoreB: 4, priority: 'B' }, { ok: true }],
    [
      'égalité, priorité nulle',
      { scoreA: 4, scoreB: 4, priority: null },
      { ok: false, reason: 'tie_without_priority' },
    ],
    ['abandon A à égalité', { scoreA: 4, scoreB: 4, statusA: 'abandon' }, { ok: true }],
    ['exclusion B à égalité', { scoreA: 4, scoreB: 4, statusB: 'exclusion' }, { ok: true }],
    ['abandon sans scores', { statusA: 'abandon' }, { ok: true }],
    ['deux exclus', { statusA: 'exclusion', statusB: 'exclusion' }, { ok: true }],
    ['score A manquant', { scoreB: 3 }, { ok: false, reason: 'missing_scores' }],
    ['score B manquant', { scoreA: 3 }, { ok: false, reason: 'missing_scores' }],
    [
      'V / D sans priorité à égalité : refusé',
      { scoreA: 4, scoreB: 4, statusA: 'victory', statusB: 'defeat' },
      { ok: false, reason: 'tie_without_priority' },
    ],
  ];
  it.each(cases)('%s', (_label, input, expected) => {
    expect(validateMatchEnd(input)).toEqual(expected);
  });
});

describe('decideMatchWinner', () => {
  const cases: Array<[string, MatchWinnerInput, MatchWinner]> = [
    ['meilleur score A', { scoreA: 5, scoreB: 3 }, { winner: 'A', reason: 'score' }],
    ['meilleur score B', { scoreA: 1, scoreB: 5 }, { winner: 'B', reason: 'score' }],
    ['égalité sans rien', { scoreA: 4, scoreB: 4 }, { winner: null }],
    ['scores absents', {}, { winner: null }],
    [
      'abandon A malgré le score',
      { scoreA: 4, scoreB: 2, statusA: 'abandon' },
      { winner: 'B', reason: 'abandon' },
    ],
    [
      'exclusion B (carton noir) malgré le score',
      { scoreA: 1, scoreB: 4, statusB: 'exclusion' },
      { winner: 'A', reason: 'exclusion' },
    ],
    [
      'deux hors combat',
      { scoreA: 4, scoreB: 2, statusA: 'abandon', statusB: 'exclusion' },
      { winner: null },
    ],
    [
      'égalité, V de l’appareil sur B',
      { scoreA: 4, scoreB: 4, statusB: 'victory' },
      { winner: 'B', reason: 'priority' },
    ],
    [
      'égalité, D de l’appareil sur B',
      { scoreA: 4, scoreB: 4, statusB: 'defeat' },
      { winner: 'A', reason: 'priority' },
    ],
    [
      'égalité, V prime sur la priorité',
      { scoreA: 4, scoreB: 4, statusA: 'victory', priority: 'B' },
      { winner: 'A', reason: 'priority' },
    ],
    [
      'score prime sur V / D',
      { scoreA: 3, scoreB: 4, statusA: 'victory' },
      { winner: 'B', reason: 'score' },
    ],
    [
      'égalité, tirage au sort',
      { scoreA: 4, scoreB: 4, override: 'B' },
      { winner: 'B', reason: 'override' },
    ],
    [
      'tirage au sort prime sur la priorité',
      { scoreA: 4, scoreB: 4, override: 'A', priority: 'B' },
      { winner: 'A', reason: 'override' },
    ],
    [
      'tirage ignoré si scores différents',
      { scoreA: 5, scoreB: 4, override: 'B' },
      { winner: 'A', reason: 'score' },
    ],
    [
      'égalité, priorité',
      { scoreA: 4, scoreB: 4, priority: 'A' },
      { winner: 'A', reason: 'priority' },
    ],
  ];
  it.each(cases)('%s', (_label, input, expected) => {
    expect(decideMatchWinner(input)).toEqual(expected);
  });

  it('winnerByScore', () => {
    expect(winnerByScore(5, 2)).toBe('A');
    expect(winnerByScore(2, 5)).toBe('B');
    expect(winnerByScore(3, 3)).toBeNull();
  });
});

describe('isAcceptableScore (tablette)', () => {
  it.each([
    [0, true],
    [15, true],
    [50, true],
    ['7', true],
    [51, false],
    [-1, false],
    [2.5, false],
    ['abc', false],
    [undefined, false],
    [NaN, false],
  ])('%s → %s', (value, expected) => {
    expect(isAcceptableScore(value)).toBe(expected);
  });
});

describe('resolveScoreLimit', () => {
  it.each([
    ['poule, réglage 5', { poolMaxScore: 5 }, 5],
    ['tableau, réglage 15', { isTableau: true, poolMaxScore: 5, tableMaxScore: 15 }, 15],
    ['tableau vétérans 10', { isTableau: true, tableMaxScore: 10 }, 10],
    ['poule sans réglage : score du match', { matchMaxScore: 4 }, 4],
    ['réglage de poule prioritaire sur le match', { poolMaxScore: 5, matchMaxScore: 4 }, 5],
    ['tableau sans réglage : 15', { isTableau: true, matchMaxScore: 5 }, 15],
    ['rien : 15', {}, 15],
    ['0 : sans limite', { isTableau: true, tableMaxScore: 0 }, Infinity],
    ['999 : sans limite', { poolMaxScore: 999 }, Infinity],
    ['laser : 15 quoi qu’il arrive', { isLaser: true, poolMaxScore: 5 }, 15],
  ])('%s', (_label, input, expected) => {
    expect(resolveScoreLimit(input)).toBe(expected);
  });

  it('limites FIE issues des réglages par défaut (t.38, t.40, t.42)', () => {
    const senior = getDefaultMaxScores(Weapon.EPEE, Category.SENIOR);
    expect(resolveScoreLimit({ poolMaxScore: senior.pool })).toBe(5);
    expect(resolveScoreLimit({ isTableau: true, tableMaxScore: senior.table })).toBe(15);
    const vet = getDefaultMaxScores(Weapon.SABRE, Category.V2);
    expect(resolveScoreLimit({ isTableau: true, tableMaxScore: vet.table })).toBe(10);
  });

  it('crossedScoreLimit : franchissement seulement', () => {
    expect(crossedScoreLimit({ scoreA: 4, scoreB: 2 }, { scoreA: 5, scoreB: 2 }, 5)).toBe(true);
    expect(crossedScoreLimit({ scoreA: 2, scoreB: 14 }, { scoreA: 2, scoreB: 15 }, 15)).toBe(true);
    expect(crossedScoreLimit({ scoreA: 5, scoreB: 2 }, { scoreA: 5, scoreB: 3 }, 5)).toBe(false);
    expect(crossedScoreLimit({ scoreA: 3, scoreB: 2 }, { scoreA: 4, scoreB: 2 }, 5)).toBe(false);
    expect(crossedScoreLimit({ scoreA: 30, scoreB: 2 }, { scoreA: 31, scoreB: 2 }, Infinity)).toBe(
      false
    );
  });
});

describe('crossedSabreBreak (t.39.1)', () => {
  it.each([
    ['sabre DE 7→8', true, 15, [7, 3], [8, 3], true],
    ['sabre DE B 7→8', true, 15, [5, 7], [5, 8], true],
    ['sabre DE déjà à 8', true, 15, [8, 3], [8, 4], false],
    ['sabre DE 6→7', true, 15, [6, 3], [7, 3], false],
    ['sabre poule (5)', true, 5, [4, 3], [5, 3], false],
    ['sabre vétérans (10)', true, 10, [7, 3], [8, 3], false],
    ['épée DE', false, 15, [7, 3], [8, 3], false],
  ] as const)('%s', (_label, isSabre, limit, prev, next, expected) => {
    expect(
      crossedSabreBreak(
        isSabre,
        limit,
        { scoreA: prev[0], scoreB: prev[1] },
        { scoreA: next[0], scoreB: next[1] }
      )
    ).toBe(expected);
  });
});

describe('passivityWinner (P-noir)', () => {
  it('score, puis classement initial, puis tirage', () => {
    const fa = { initialRanking: 4 };
    const fb = { initialRanking: 2 };
    expect(passivityWinner({ scoreA: 3, scoreB: 1, fencerA: fa, fencerB: fb })).toEqual({
      action: 'finish',
      winner: 'A',
      reasonKey: 'referee.reason_passivity',
    });
    expect(passivityWinner({ scoreA: 2, scoreB: 2, fencerA: fa, fencerB: fb })).toEqual({
      action: 'finish',
      winner: 'B',
      reasonKey: 'referee.reason_passivity_seed',
    });
    expect(passivityWinner({ scoreA: 2, scoreB: 2, fencerA: {}, fencerB: {} })).toEqual({
      action: 'tiebreak',
    });
  });
});
