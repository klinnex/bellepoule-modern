import { describe, it, expect } from 'vitest';
import { parseInlineScoreInput } from './inlineScoreInput';

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
