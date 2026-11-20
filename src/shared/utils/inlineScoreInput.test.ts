import { describe, it, expect } from 'vitest';
import {
  inlineCellText,
  isInlineScoreComplete,
  parseInlineScoreInput,
  resolveInlineSubmit,
  victoryLabel,
} from './inlineScoreInput';

describe('parseInlineScoreInput', () => {
  it('vide', () => {
    expect(parseInlineScoreInput('  ', 5)).toEqual({ kind: 'empty' });
  });
  it('score numérique', () => {
    expect(parseInlineScoreInput('3', 5)).toEqual({ kind: 'score', value: 3 });
  });
  it('V = score max (insensible à la casse)', () => {
    expect(parseInlineScoreInput('v', 5)).toEqual({ kind: 'victory', value: 5 });
    expect(parseInlineScoreInput('V', 15)).toEqual({ kind: 'victory', value: 15 });
  });
  it('V sans score max = invalide', () => {
    expect(parseInlineScoreInput('V', 0)).toEqual({ kind: 'invalid' });
  });
  it('W+chiffre = victoire de départage', () => {
    expect(parseInlineScoreInput('w4', 5)).toEqual({ kind: 'tieWin', value: 4 });
    expect(parseInlineScoreInput('W10', 15)).toEqual({ kind: 'tieWin', value: 10 });
  });
  it('formats invalides', () => {
    expect(parseInlineScoreInput('W', 5)).toEqual({ kind: 'invalid' });
    expect(parseInlineScoreInput('-1', 5)).toEqual({ kind: 'invalid' });
    expect(parseInlineScoreInput('abc', 5)).toEqual({ kind: 'invalid' });
  });
});

describe('resolveInlineSubmit : règlement o.17', () => {
  const base = (over: Partial<Parameters<typeof resolveInlineSubmit>[0]>) => ({
    raw: '5',
    maxScore: 5,
    tieByVictory: true,
    isLaserSabre: false,
    key: 'a-b',
    rowId: 'a',
    colId: 'b',
    inverted: false,
    buffer: {},
    recordedMirror: undefined,
    winnerCells: new Set<string>(),
    ...over,
  });
  it('W5 contre 5 : égalité au score max refusée', () => {
    const winnerCells = new Set<string>();
    resolveInlineSubmit(base({ raw: 'W5', key: 'a-b', winnerCells }));
    const r = resolveInlineSubmit(
      base({ raw: '5', key: 'b-a', rowId: 'b', colId: 'a', buffer: { 'a-b': 5 }, winnerCells })
    );
    expect(r).toEqual({ action: 'error', msgKey: 'poolView.tie_at_max', max: 5 });
  });
  it('V contre 5 : refusé, sans fenêtre de départage', () => {
    const r = resolveInlineSubmit(base({ raw: 'V', recordedMirror: 5 }));
    expect(r).toMatchObject({ action: 'error', msgKey: 'poolView.tie_at_max' });
  });
  it('W4 contre 4 : victoire à égalité sous le max acceptée', () => {
    const winnerCells = new Set<string>();
    resolveInlineSubmit(base({ raw: 'W4', winnerCells }));
    const r = resolveInlineSubmit(
      base({ raw: '4', key: 'b-a', rowId: 'b', colId: 'a', buffer: { 'a-b': 4 }, winnerCells })
    );
    expect(r).toMatchObject({ action: 'commit', scoreA: 4, scoreB: 4, winner: 'B' });
  });
  it('Sabre Laser : égalité au max acceptée avec vainqueur', () => {
    const winnerCells = new Set<string>(['b-a']);
    const r = resolveInlineSubmit(
      base({ raw: '21', maxScore: 21, isLaserSabre: true, recordedMirror: 21, winnerCells })
    );
    expect(r).toMatchObject({ action: 'commit', winner: 'B' });
  });
  it('Sabre Laser : égalité sans vainqueur → départage, jamais de match nul', () => {
    expect(
      resolveInlineSubmit(base({ raw: '7', maxScore: 21, isLaserSabre: true, recordedMirror: 7 }))
    ).toEqual({ action: 'modal' });
    expect(
      resolveInlineSubmit(
        base({ raw: '7', maxScore: 21, isLaserSabre: true, tieByVictory: false, recordedMirror: 7 })
      )
    ).toEqual({ action: 'error', msgKey: 'poolView.draw_laser' });
  });
  it('Sabre Laser : V refusé', () => {
    expect(resolveInlineSubmit(base({ raw: 'V', maxScore: 21, isLaserSabre: true }))).toEqual({
      action: 'error',
      msgKey: 'poolView.inline_v_laser',
    });
  });
});

describe('isInlineScoreComplete', () => {
  it('max 5 : tout chiffre et V sont complets', () => {
    for (const v of ['0', '3', '5', 'v', 'W4'])
      expect(isInlineScoreComplete(v, 5, false)).toBe(true);
  });
  it('max 15 : « 1 » attend un second chiffre', () => {
    expect(isInlineScoreComplete('1', 15, false)).toBe(false);
    expect(isInlineScoreComplete('12', 15, false)).toBe(true);
    expect(isInlineScoreComplete('2', 15, false)).toBe(true);
    expect(isInlineScoreComplete('W1', 15, false)).toBe(false);
  });
  it('incomplet : W seul, vide, sans max, V au laser', () => {
    expect(isInlineScoreComplete('W', 5, false)).toBe(false);
    expect(isInlineScoreComplete('', 5, false)).toBe(false);
    expect(isInlineScoreComplete('3', 0, false)).toBe(false);
    expect(isInlineScoreComplete('V', 21, true)).toBe(false);
  });
});

describe('inlineCellText / victoryLabel', () => {
  const opts = { maxScore: 5, isLaserSabre: false };
  it('victoire au max = V, à égalité = W, sinon le score', () => {
    expect(inlineCellText({ value: 5, isVictory: true, opponent: 2, ...opts })).toBe('V');
    expect(inlineCellText({ value: 3, isVictory: true, opponent: 3, ...opts })).toBe('W3');
    expect(inlineCellText({ value: 4, isVictory: true, opponent: 2, ...opts })).toBe('4');
    expect(inlineCellText({ value: 2, isVictory: false, opponent: 5, ...opts })).toBe('2');
  });
  it('affichage : V seul au max, V+score sinon, toujours V+score au laser', () => {
    expect(victoryLabel(5, 5, false)).toBe('V');
    expect(victoryLabel(4, 5, false)).toBe('V4');
    expect(victoryLabel(21, 21, true)).toBe('V21');
  });
});
