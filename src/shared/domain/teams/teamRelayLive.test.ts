import { describe, it, expect } from 'vitest';
import { relayCumul, relayCapFor, isRelayComplete, relayWinnerSide } from './teamRelayLive';

const bouts = [
  { boutOrder: 1, scoreA: 5, scoreB: 2, status: 'finished' },
  { boutOrder: 2, scoreA: 0, scoreB: 0, status: 'in_progress' },
  { boutOrder: 3, scoreA: 0, scoreB: 0, status: 'not_started' },
];

describe('teamRelayLive (#1086)', () => {
  it('cumul = relais précédents terminés + relais en cours', () => {
    expect(relayCumul(bouts, bouts[1], 3, 4)).toEqual({ cumulA: 8, cumulB: 6 });
    expect(relayCumul(bouts, null, 0, 0)).toEqual({ cumulA: 5, cumulB: 2 });
  });

  it('palier progressif plafonné à la cible', () => {
    const rule = { stepSize: 5, target: 45 };
    expect(relayCapFor(1, rule)).toBe(5);
    expect(relayCapFor(9, rule)).toBe(45);
    expect(relayCapFor(10, rule)).toBe(45);
  });

  it('relais terminé au palier ou au bout de 3 minutes', () => {
    expect(isRelayComplete(9, 10, 10, 30)).toBe(true);
    expect(isRelayComplete(9, 8, 10, 30)).toBe(false);
    expect(isRelayComplete(1, 0, 10, 180)).toBe(true);
  });

  it('vainqueur au cumul, null si égalité', () => {
    expect(relayWinnerSide(7, 6)).toBe('A');
    expect(relayWinnerSide(6, 7)).toBe('B');
    expect(relayWinnerSide(6, 6)).toBeNull();
  });
});
