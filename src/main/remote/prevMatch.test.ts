/**
 * Tests de la fonction « match précédent » (PREV, #1829)
 */
import { describe, it, expect } from 'vitest';
import {
  PREV_WINDOW_MS,
  checkPrevEligibility,
  restoreForCorrection,
  type LastFinishedSnapshot,
} from './prevMatch';
import type { ArenaMatch } from '../../shared/types/remote';

const fencer = (id: string) => ({ id, firstName: id, lastName: id }) as never;

const finished: ArenaMatch = {
  id: 'm1',
  poolId: 'p1',
  fencerA: fencer('a'),
  fencerB: fencer('b'),
  scoreA: 5,
  scoreB: 3,
  status: 'finished',
  startTime: new Date(1000),
  endTime: new Date(2000),
  duration: 180,
  deviceEnd: { winner: 'A', reason: 'priority' },
};

const snapshot: LastFinishedSnapshot = {
  match: finished,
  finishedAt: 10_000,
  events: { exits: [] },
};
const next: ArenaMatch = { ...finished, id: 'm2', status: 'not_started', scoreA: 0, scoreB: 0 };

describe('checkPrevEligibility', () => {
  it('refuse quand rien n’a été terminé sur la piste', () => {
    expect(checkPrevEligibility(undefined, next, 10_000)).toEqual({ ok: false, reason: 'none' });
  });

  it('accepte dans la fenêtre de correction, match suivant pas démarré', () => {
    expect(checkPrevEligibility(snapshot, next, 10_000 + 1000)).toEqual({ ok: true });
    expect(checkPrevEligibility(snapshot, null, 10_000)).toEqual({ ok: true });
  });

  it('accepte exactement à la limite de la fenêtre', () => {
    expect(checkPrevEligibility(snapshot, next, 10_000 + PREV_WINDOW_MS)).toEqual({ ok: true });
  });

  it('refuse après la fenêtre de correction', () => {
    expect(checkPrevEligibility(snapshot, next, 10_000 + PREV_WINDOW_MS + 1)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('ne coupe jamais un combat en cours', () => {
    const running: ArenaMatch = { ...next, status: 'in_progress' };
    expect(checkPrevEligibility(snapshot, running, 10_500)).toEqual({
      ok: false,
      reason: 'in_progress',
    });
  });
});

describe('restoreForCorrection', () => {
  it('garde scores et tireurs, efface fin et durée', () => {
    const r = restoreForCorrection(snapshot);
    expect(r.id).toBe('m1');
    expect(r.scoreA).toBe(5);
    expect(r.scoreB).toBe(3);
    expect(r.status).toBe('not_started');
    expect(r.endTime).toBeNull();
    expect(r.startTime).toBeNull();
    expect(r.duration).toBeUndefined();
    expect(r.deviceEnd).toBeUndefined();
  });

  it('ne modifie pas le snapshot d’origine', () => {
    restoreForCorrection(snapshot);
    expect(snapshot.match.status).toBe('finished');
    expect(snapshot.match.duration).toBe(180);
  });
});
