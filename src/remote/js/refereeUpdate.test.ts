/**
 * Module arbitre /js/refereeUpdate.js (#1401) : transitions d'état reçues du serveur.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const U = req('./refereeUpdate.js');

const fa = { id: 'a' };
const fb = { id: 'b' };
const idle = { currentMatchId: undefined, matchStatus: 'not_started' };

describe('refereeUpdate.js', () => {
  it('scoreValue : nombre, objet, absent', () => {
    expect(U.scoreValue(4)).toBe(4);
    expect(U.scoreValue({ value: 3 })).toBe(3);
    expect(U.scoreValue({})).toBe(0);
    expect(U.scoreValue(undefined)).toBe(0);
    expect(U.scoreValue(null)).toBe(0);
  });

  it('shouldReloadForRules : seulement règles chargées, différentes et hors match', () => {
    const s = {
      rulesLoaded: true,
      isModernFencing: false,
      timerRunning: false,
      matchStatus: 'not_started',
    };
    expect(U.shouldReloadForRules(s, { modernRules: true })).toBe(true);
    expect(U.shouldReloadForRules(s, { modernRules: false })).toBe(false);
    expect(U.shouldReloadForRules(s, {})).toBe(false);
    expect(U.shouldReloadForRules({ ...s, rulesLoaded: false }, { modernRules: true })).toBe(false);
    expect(U.shouldReloadForRules({ ...s, timerRunning: true }, { modernRules: true })).toBe(false);
    expect(
      U.shouldReloadForRules({ ...s, matchStatus: 'in_progress' }, { modernRules: true })
    ).toBe(false);
  });

  it('idle : poule terminée, fermé par l’appli, ou simple nettoyage', () => {
    expect(U.planStatusTransition(idle, { status: 'idle', poolComplete: true }).action).toBe(
      'poolComplete'
    );
    expect(
      U.planStatusTransition({ ...idle, matchStatus: 'in_progress' }, { status: 'idle' }).action
    ).toBe('closedByApp');
    expect(U.planStatusTransition(idle, { status: 'idle' }).action).toBe('idleClear');
  });

  it('in_progress : reprise avec scores (nombre ou objet), ignorée si déjà connu', () => {
    const data = {
      status: 'in_progress',
      match: { id: 'm1', poolId: 'p1' },
      fencerA: fa,
      fencerB: fb,
      scoreA: { value: 2 },
      scoreB: 3,
    };
    expect(U.planStatusTransition(idle, data)).toEqual({
      action: 'resume',
      match: {
        id: 'm1',
        poolId: 'p1',
        fencerA: fa,
        fencerB: fb,
        scoreA: { value: 2 },
        scoreB: { value: 3 },
        status: 'in_progress',
      },
    });
    expect(U.planStatusTransition({ ...idle, currentMatchId: 'm1' }, data).action).toBe('none');
    expect(U.planStatusTransition({ ...idle, matchStatus: 'in_progress' }, data).action).toBe(
      'none'
    );
    expect(U.planStatusTransition(idle, { status: 'in_progress' }).action).toBe('none');
  });

  it('in_progress : tireurs du match en repli', () => {
    const r = U.planStatusTransition(idle, {
      status: 'in_progress',
      match: { id: 'm1', fencerA: fa, fencerB: fb },
    });
    expect(r.match.fencerA).toBe(fa);
    expect(r.match.scoreA).toEqual({ value: 0 });
  });

  it('ready : nouveau match, déjà courant, ou match en cours', () => {
    const data = { status: 'ready', match: { id: 'm2', poolId: 'p', fencerA: fa, fencerB: fb } };
    const n = U.planStatusTransition(idle, data);
    expect(n).toMatchObject({ action: 'newMatch', hidePoolOverlay: true });
    expect(n.match).toMatchObject({ id: 'm2', status: 'not_started', scoreA: { value: 0 } });
    expect(U.planStatusTransition({ ...idle, currentMatchId: 'm2' }, data)).toEqual({
      action: 'none',
      hidePoolOverlay: true,
    });
    expect(U.planStatusTransition({ ...idle, matchStatus: 'in_progress' }, data)).toEqual({
      action: 'notifyNextAfter',
      hidePoolOverlay: true,
    });
    expect(U.planStatusTransition(idle, { status: 'ready' })).toEqual({ action: 'none' });
    expect(U.planStatusTransition(idle, {})).toEqual({ action: 'none' });
  });

  it('replaceOrPush et markReadyOrPush', () => {
    const list = [{ id: 'a', status: 'finished', extra: 1 }];
    U.replaceOrPush(list, { id: 'a', status: 'in_progress' });
    expect(list).toEqual([{ id: 'a', status: 'in_progress' }]);
    U.replaceOrPush(list, { id: 'b' });
    expect(list.map(m => m.id)).toEqual(['a', 'b']);

    const l2 = [{ id: 'a', status: 'finished', extra: 1 }];
    U.markReadyOrPush(l2, { id: 'a', status: 'x' });
    expect(l2).toEqual([{ id: 'a', status: 'not_started', extra: 1 }]);
    U.markReadyOrPush(l2, { id: 'c', status: 'not_started' });
    expect(l2.length).toBe(2);
  });

  it('referee.html charge le module et délègue', () => {
    const html =
      fs.readFileSync(path.join(__dirname, '..', 'referee.html'), 'utf8') +
      fs.readFileSync(path.join(__dirname, 'refereeApp.js'), 'utf8') +
      fs.readFileSync(path.join(__dirname, 'refereeAppBase.js'), 'utf8'); // page + script extrait (#1600)
    expect(html).toContain('<script src="/js/refereeUpdate.js"></script>');
    expect(html).toContain('BPRefereeUpdate.planStatusTransition(');
    expect(html).not.toContain('const restored = {');
  });
});
