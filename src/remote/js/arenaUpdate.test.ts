/**
 * Module arène /js/arenaUpdate.js (#1401) : plan de mise à jour d'affichage.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const A = req('./arenaUpdate.js');

const base = {
  _prioFencerId: null,
  theme: 'dark',
  currentCustomTheme: null,
  matchStatus: 'idle',
  showPhotos: false,
  inversionEnabled: false,
};
type Op = { op: string; [k: string]: unknown };
const names = (ops: Op[]) => ops.map(o => o.op);
const sets = (ops: Op[]) =>
  Object.fromEntries(ops.filter(o => o.op === 'set').map(o => [o.key as string, o.value]));

describe('arenaUpdate.js planArenaUpdate', () => {
  it('message vide : bannières et visibilité seulement', () => {
    expect(names(A.planArenaUpdate(base, {}))).toEqual([
      'updateWaitingOvertimeBanner',
      'updateSuddenDeathBanner',
      'updateVisibility',
    ]);
  });

  it('thème : appliqué si changé, ou personnalisé modifié', () => {
    expect(names(A.planArenaUpdate(base, { theme: 'dark' }))).not.toContain('applyTheme');
    expect(names(A.planArenaUpdate(base, { theme: 'light' }))).toContain('applyTheme');
    const same = { ...base, theme: 'custom', currentCustomTheme: { a: 1 } };
    expect(
      names(A.planArenaUpdate(same, { theme: 'custom', customTheme: { a: 1 } }))
    ).not.toContain('applyTheme');
    expect(names(A.planArenaUpdate(same, { theme: 'custom', customTheme: { a: 2 } }))).toContain(
      'applyTheme'
    );
  });

  it('tireur prioritaire : cadre effacé si le nouveau match ne le contient pas', () => {
    const s = { ...base, _prioFencerId: 'f1' };
    const keep = A.planArenaUpdate(s, { match: { fencerA: { id: 'f1' }, fencerB: { id: 'f2' } } });
    expect(names(keep)).not.toContain('applyPriorityFrame');
    const drop = A.planArenaUpdate(s, { match: { fencerA: { id: 'x' }, fencerB: { id: 'y' } } });
    expect(drop.slice(0, 2)).toEqual([
      { op: 'set', key: '_prioFencerId', value: null },
      { op: 'applyPriorityFrame', side: null },
    ]);
    expect(names(A.planArenaUpdate(s, { match: null }))).toContain('applyPriorityFrame');
    expect(names(A.planArenaUpdate(s, { scoreA: 1 }))).not.toContain('applyPriorityFrame');
  });

  it('scores : respectent l’inversion, y compris celle du même message', () => {
    const plain = A.planArenaUpdate(base, { scoreA: 3, scoreB: 5 });
    expect(plain.filter((o: Op) => o.op === 'score')).toEqual([
      { op: 'score', id: 'score-b', value: 3 },
      { op: 'score', id: 'score-a', value: 5 },
    ]);
    const swapped = A.planArenaUpdate(base, { swapped: true, scoreA: 3 });
    expect(swapped.find((o: Op) => o.op === 'score')).toEqual({
      op: 'score',
      id: 'score-a',
      value: 3,
    });
  });

  it('photos : intro seulement en statut ready avec photos', () => {
    const s = { ...base, matchStatus: 'ready', showPhotos: true };
    expect(names(A.planArenaUpdate(s, { match: { fencerA: {} } }))).toContain('updatePhotoIntro');
    expect(names(A.planArenaUpdate(base, { match: { fencerA: {} } }))).not.toContain(
      'updatePhotoIntro'
    );
    // statut du même message pris en compte pour match, pas pour swapped (ordre d'origine)
    const ops = A.planArenaUpdate(
      { ...base, showPhotos: true },
      { swapped: true, status: 'ready' }
    );
    expect(names(ops)).not.toContain('updatePhotoIntro');
  });

  it('statut finished : masque l’animation pile ou face', () => {
    const ops = A.planArenaUpdate(base, { status: 'finished' });
    expect(sets(ops).matchStatus).toBe('finished');
    expect(names(ops)).toEqual(expect.arrayContaining(['updateStatusBadge', 'hideCoinFlip']));
  });

  it('prochain match : affichage d’attente selon le statut résultant', () => {
    const idle = A.planArenaUpdate(base, { nextMatch: { id: 1 } });
    expect(names(idle)).toContain('updateIdleNextMatchDisplay');
    const live = A.planArenaUpdate(base, { status: 'in_progress', nextMatch: null });
    expect(names(live)).not.toContain('updateIdleNextMatchDisplay');
    expect(sets(live).nextMatch).toBeNull();
    const readyNoPhotos = A.planArenaUpdate({ ...base, matchStatus: 'ready' }, { nextMatch: {} });
    expect(names(readyNoPhotos)).toContain('updateIdleNextMatchDisplay');
  });

  it('mort subite : démarrage annule l’attente d’overtime', () => {
    const ops = A.planArenaUpdate(base, { waitingOvertime: true, suddenDeath: true, time: 60 });
    expect(sets(ops).waitingOvertime).toBe(false);
    expect(sets(ops).isSuddenDeath).toBe(true);
    expect(sets(ops).timerSeconds).toBe(60);
    const t = ops.find((o: Op) => o.op === 'updateTimerDisplay');
    expect(t).toEqual({ op: 'updateTimerDisplay', timerStatus: undefined });
  });

  it('arena.html charge le module et délègue', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'arena.html'), 'utf8');
    expect(html).toContain('<script src="/js/arenaUpdate.js"></script>');
    expect(html).toContain('ArenaUpdate.planArenaUpdate(');
  });
});
