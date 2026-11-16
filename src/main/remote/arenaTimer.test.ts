/**
 * Chrono des arènes : mémorisation, persistance limitée, reprise à l'arrêt (#1829)
 */
import { describe, it, expect } from 'vitest';
import {
  RUNNING_PERSIST_INTERVAL_MS,
  extractSavedTimer,
  isValidTimerTime,
  normalizeTimerSnapshot,
  recordArenaTimer,
  timerForMatch,
  timerJoinFields,
  withSavedTimer,
} from './arenaTimer';
import type { ArenaMatch, ArenaTimerSnapshot } from '../../shared/types/remote';

const match = (id = 'm1') =>
  ({
    id,
    poolId: 'p1',
    fencerA: { id: 'a' },
    fencerB: { id: 'b' },
    scoreA: 2,
    scoreB: 1,
    status: 'in_progress',
    startTime: null,
    endTime: null,
  }) as unknown as ArenaMatch;

describe('arenaTimer (#1829)', () => {
  it('isValidTimerTime : 0 à 3600 s, nombres finis seulement', () => {
    expect(isValidTimerTime(0)).toBe(true);
    expect(isValidTimerTime(179.9)).toBe(true);
    expect(isValidTimerTime(3600)).toBe(true);
    expect(isValidTimerTime(-1)).toBe(false);
    expect(isValidTimerTime(3601)).toBe(false);
    expect(isValidTimerTime(NaN)).toBe(false);
    expect(isValidTimerTime('90')).toBe(false);
  });

  it('normalizeTimerSnapshot : arrondi au centième, prolongation inconnue écartée', () => {
    expect(
      normalizeTimerSnapshot({ matchId: 'm1', time: 12.3456, overtimeType: 'bogus', running: 1 })
    ).toEqual({
      matchId: 'm1',
      time: 12.35,
      suddenDeath: false,
      overtimeType: null,
      running: false,
    });
    expect(normalizeTimerSnapshot({ matchId: '', time: 10 })).toBeNull();
    expect(normalizeTimerSnapshot({ matchId: 'm1', time: -5 })).toBeNull();
    expect(normalizeTimerSnapshot(null)).toBeNull();
  });

  type TestArena = { currentMatch: ArenaMatch | null; timer?: ArenaTimerSnapshot | null };
  const arenaWith = (m: ArenaMatch | null): TestArena => ({ currentMatch: m });

  it('recordArenaTimer : arrêt sauvegardé aussitôt, chrono en marche au plus toutes les 5 s', () => {
    const a = arenaWith(match());
    expect(recordArenaTimer(a, { time: 150, timerStatus: 'running' }, 10_000)).toBe(true);
    expect(recordArenaTimer(a, { time: 149, timerStatus: 'running' }, 11_000)).toBe(false);
    // Valeur mémorisée même sans sauvegarde
    expect(a.timer).toMatchObject({ matchId: 'm1', time: 149, running: true });
    expect(
      recordArenaTimer(
        a,
        { time: 144, timerStatus: 'running' },
        10_000 + RUNNING_PERSIST_INTERVAL_MS
      )
    ).toBe(true);
    // Arrêt du chrono : sauvegarde immédiate
    expect(recordArenaTimer(a, { time: 143.5, timerStatus: 'paused' }, 15_100)).toBe(true);
    expect(a.timer).toMatchObject({ time: 143.5, running: false });
    // Même chrono répété (INFO de l'appareil à l'arrêt) : pas de nouvelle sauvegarde
    expect(recordArenaTimer(a, { time: 143.5, timerStatus: 'paused' }, 15_200)).toBe(false);
    // Limitation propre à chaque arène
    expect(recordArenaTimer(arenaWith(match()), { time: 9, timerStatus: 'running' }, 15_200)).toBe(
      true
    );
  });

  it('recordArenaTimer : ignoré sans match, valeur invalide ou pendant le repos', () => {
    const none = arenaWith(null);
    expect(recordArenaTimer(none, { time: 60, timerStatus: 'paused' }, 0)).toBe(false);
    const a = arenaWith(match());
    expect(recordArenaTimer(a, { time: undefined, timerStatus: 'paused' }, 0)).toBe(false);
    expect(recordArenaTimer(a, { time: 45, timerStatus: 'paused', resting: true }, 0)).toBe(false);
    expect(none.timer).toBeUndefined();
    expect(a.timer).toBeUndefined();
  });

  it('timerForMatch : seulement pour le match en cours de l’arène', () => {
    const timer = { matchId: 'm1', time: 30 };
    expect(timerForMatch({ currentMatch: match('m1'), timer })).toMatchObject({ time: 30 });
    expect(timerForMatch({ currentMatch: match('m2'), timer })).toBeNull();
    expect(timerForMatch({ currentMatch: null, timer })).toBeNull();
    expect(timerForMatch({ currentMatch: match('m1') })).toBeNull();
    expect(timerForMatch(null)).toBeNull();
  });

  it('sauvegarde puis reprise : chrono joint au match, repris à l’arrêt et retiré du match', () => {
    const snap: ArenaTimerSnapshot = {
      matchId: 'm1',
      time: 97,
      suddenDeath: true,
      overtimeType: 'supplementary',
      running: true,
    };
    const saved = JSON.parse(JSON.stringify(withSavedTimer(match(), snap)));
    expect(saved.savedTimer).toMatchObject({ time: 97 });
    const { match: m, timer } = extractSavedTimer(saved);
    expect(m).not.toHaveProperty('savedTimer');
    expect(m.id).toBe('m1');
    expect(timer).toEqual({
      matchId: 'm1',
      time: 97,
      suddenDeath: true,
      overtimeType: 'supplementary',
      running: false,
    });
    expect(withSavedTimer(match(), null)).not.toHaveProperty('savedTimer');
    expect(withSavedTimer(null, snap)).toBeNull();
  });

  it('reprise : chrono d’un autre match ou corrompu ignoré', () => {
    expect(
      extractSavedTimer({ ...match('m1'), savedTimer: { matchId: 'm2', time: 50 } } as ArenaMatch)
        .timer
    ).toBeNull();
    expect(
      extractSavedTimer({ ...match('m1'), savedTimer: { matchId: 'm1', time: 'x' } } as ArenaMatch)
        .timer
    ).toBeNull();
    expect(extractSavedTimer(match('m1')).timer).toBeNull();
  });

  it('timerJoinFields : temps et état transmis au client qui rejoint l’arène', () => {
    expect(timerJoinFields(null)).toEqual({});
    expect(timerJoinFields({ matchId: 'm1', time: 61.5 })).toEqual({
      time: 61.5,
      timerStatus: 'paused',
      suddenDeath: false,
      overtimeType: null,
    });
    expect(timerJoinFields({ matchId: 'm1', time: 20, running: true }).timerStatus).toBe('running');
  });
});
