import { describe, it, expect } from 'vitest';
import type { MatchEventEntry } from '../types';
import { buildMatchReplay, formatReplayOffset } from './matchReplay';

let n = 0;
const ev = (
  p: Partial<MatchEventEntry> & Pick<MatchEventEntry, 'eventType' | 'timestamp'>
): MatchEventEntry => ({
  id: `e${++n}`,
  matchId: 'm1',
  fencerId: null,
  fencerLastName: null,
  fencerFirstName: null,
  fencerSide: null,
  previousScoreA: null,
  previousScoreB: null,
  newScoreA: null,
  newScoreB: null,
  changedBy: null,
  refereeName: null,
  ipAddress: null,
  changeReason: null,
  zone: null,
  points: null,
  cardType: null,
  cardReason: null,
  cardGroup: null,
  resultingExclusion: null,
  exitType: null,
  ...p,
});
const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 10, 0, s)).toISOString();

describe('buildMatchReplay (#1074)', () => {
  it('trie par horodatage et calcule le temps écoulé', () => {
    const frames = buildMatchReplay([
      ev({
        eventType: 'score_change',
        timestamp: t(30),
        newScoreA: { value: 1 },
        newScoreB: { value: 0 },
      }),
      ev({
        eventType: 'score_change',
        timestamp: t(0),
        newScoreA: { value: 0 },
        newScoreB: { value: 0 },
      }),
    ]);
    expect(frames.map(f => f.offsetMs)).toEqual([0, 30_000]);
    expect(frames.map(f => [f.scoreA, f.scoreB])).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it('score_change fait foi : les touches ne sont pas recomptées', () => {
    const frames = buildMatchReplay([
      ev({
        eventType: 'score_change',
        timestamp: t(0),
        newScoreA: { value: 0 },
        newScoreB: { value: 0 },
      }),
      ev({ eventType: 'touch', timestamp: t(1), fencerSide: 'A', points: 3 }),
      ev({
        eventType: 'score_change',
        timestamp: t(2),
        newScoreA: { value: 3 },
        newScoreB: { value: 0 },
      }),
    ]);
    expect(frames.map(f => f.scoreA)).toEqual([0, 0, 3]);
  });

  it('score final seul : le score progresse avec les touches puis se recale', () => {
    const frames = buildMatchReplay([
      ev({ eventType: 'touch', timestamp: t(1), fencerSide: 'A', points: 3 }),
      ev({ eventType: 'touch', timestamp: t(2), fencerSide: 'B', points: 1 }),
      ev({ eventType: 'touch', timestamp: t(3), fencerSide: 'A', points: 5 }),
      ev({
        eventType: 'score_change',
        timestamp: t(4),
        newScoreA: { value: 8 },
        newScoreB: { value: 1 },
      }),
    ]);
    expect(frames.map(f => [f.scoreA, f.scoreB])).toEqual([
      [3, 0],
      [3, 1],
      [8, 1],
      [8, 1],
    ]);
  });

  it('sans score_change : cumule touches et sorties d’arène (points à l’adversaire)', () => {
    const frames = buildMatchReplay([
      ev({ eventType: 'touch', timestamp: t(1), fencerSide: 'A', points: 5 }),
      ev({ eventType: 'touch', timestamp: t(2), fencerSide: 'B', points: 1 }),
      ev({ eventType: 'arena_exit', timestamp: t(3), fencerSide: 'A', points: 3 }),
    ]);
    expect(frames.map(f => [f.scoreA, f.scoreB])).toEqual([
      [5, 0],
      [5, 1],
      [5, 4],
    ]);
  });

  it('accumule les cartons par côté sans muter les images précédentes', () => {
    const frames = buildMatchReplay([
      ev({
        eventType: 'card',
        timestamp: t(1),
        fencerSide: 'B',
        cardType: 'yellow',
        cardReason: 'Corps à corps',
      }),
      ev({
        eventType: 'card',
        timestamp: t(2),
        fencerSide: 'B',
        cardType: 'red',
        cardReason: null,
      }),
    ]);
    expect(frames[0].cardsB).toHaveLength(1);
    expect(frames[1].cardsB.map(c => c.type)).toEqual(['yellow', 'red']);
    expect(frames[1].cardsA).toEqual([]);
  });

  it('journal vide → aucune image', () => {
    expect(buildMatchReplay([])).toEqual([]);
  });
});

describe('formatReplayOffset', () => {
  it('mm:ss', () => {
    expect(formatReplayOffset(0)).toBe('00:00');
    expect(formatReplayOffset(125_400)).toBe('02:05');
  });
});
