/**
 * Module arbitre /js/refereeControls.js (#1401) : boutons de contrôle, classes du chrono, repos.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const R = req('./refereeControls.js');

const base = {
  priorityAnimating: false,
  waitingOvertimeStart: false,
  waitingCoinFlip: false,
  scoreA: 0,
  scoreB: 0,
  matchStatus: 'not_started',
  hasMatch: true,
  timerRunning: false,
  overtimeLabel: '',
};

describe('refereeControls.js controlButtonsState', () => {
  it('tirage du prioritaire : tout verrouillé', () => {
    expect(R.controlButtonsState({ ...base, priorityAnimating: true })).toEqual({ lockAll: true });
  });

  it('attente du temps supplémentaire : libellé avec la durée, pas de bouton repos', () => {
    const r = R.controlButtonsState({
      ...base,
      waitingOvertimeStart: true,
      overtimeLabel: '1 min',
    });
    expect(r.start).toMatchObject({
      disabled: false,
      key: 'referee.launch_overtime',
      params: { label: '1 min' },
      className: 'control-btn btn-launch-overtime',
    });
    expect(r.finishDisabled).toBe(false);
    expect(r.updateRestButton).toBeUndefined();
  });

  it('tirage au sort : seulement à égalité', () => {
    const tie = R.controlButtonsState({
      ...base,
      waitingCoinFlip: true,
      matchStatus: 'in_progress',
    });
    expect(tie.start.key).toBe('referee.coin_btn');
    expect(tie.updateRestButton).toBe(true);
    const notTie = R.controlButtonsState({
      ...base,
      waitingCoinFlip: true,
      scoreA: 5,
      matchStatus: 'in_progress',
    });
    expect(notTie.start.key).toBe('referee.resume');
  });

  it('match non commencé : désactivé sans match', () => {
    expect(R.controlButtonsState(base).start).toMatchObject({
      disabled: false,
      key: 'referee.start',
    });
    expect(R.controlButtonsState({ ...base, hasMatch: false }).start.disabled).toBe(true);
    expect(R.controlButtonsState(base).finishDisabled).toBe(true);
  });

  it('en cours : pause / reprise, terminer actif', () => {
    const run = R.controlButtonsState({ ...base, matchStatus: 'in_progress', timerRunning: true });
    expect(run.start).toMatchObject({ key: 'referee.pause', className: 'control-btn btn-pause' });
    expect(run.finishDisabled).toBe(false);
    const paused = R.controlButtonsState({ ...base, matchStatus: 'in_progress' });
    expect(paused.start).toMatchObject({
      key: 'referee.resume',
      className: 'control-btn btn-resume',
    });
  });

  it('terminé : démarrer désactivé', () => {
    const r = R.controlButtonsState({ ...base, matchStatus: 'finished' });
    expect(r.start).toMatchObject({ disabled: true, className: 'control-btn btn-start' });
    expect(r.finishDisabled).toBe(true);
  });
});

describe('refereeControls.js chrono et repos', () => {
  it('timerClasses', () => {
    const d = 180;
    expect(
      R.timerClasses({ timerRunning: true, timerSeconds: 100, defaultTimerSeconds: d })
    ).toEqual(['timer-display', 'running']);
    expect(
      R.timerClasses({ timerRunning: false, timerSeconds: 100, defaultTimerSeconds: d })
    ).toEqual(['timer-display', 'paused']);
    expect(
      R.timerClasses({ timerRunning: false, timerSeconds: d, defaultTimerSeconds: d })
    ).toEqual(['timer-display']);
    expect(
      R.timerClasses({ timerRunning: true, timerSeconds: 30, defaultTimerSeconds: d })
    ).toEqual(['timer-display', 'running', 'warning']);
    expect(
      R.timerClasses({ timerRunning: true, timerSeconds: 10, defaultTimerSeconds: d })
    ).toEqual(['timer-display', 'running', 'danger']);
  });

  it('scoreButtonsLocked', () => {
    expect(R.scoreButtonsLocked('not_started')).toBe(true);
    expect(R.scoreButtonsLocked('finished')).toBe(true);
    expect(R.scoreButtonsLocked('in_progress')).toBe(false);
  });

  it('canStartRest : toutes les conditions requises', () => {
    const ok = {
      isModernFencing: true,
      restSeconds: 60,
      hasMatch: true,
      matchStatus: 'in_progress',
      timerSeconds: 0,
      timerRunning: false,
      isResting: false,
    };
    expect(R.canStartRest(ok)).toBe(true);
    for (const patch of [
      { isModernFencing: false },
      { restSeconds: 0 },
      { hasMatch: false },
      { matchStatus: 'finished' },
      { timerSeconds: 5 },
      { timerRunning: true },
      { isResting: true },
    ]) {
      expect(R.canStartRest({ ...ok, ...patch })).toBe(false);
    }
  });

  it('referee.html charge le module et délègue', () => {
    const html =
      fs.readFileSync(path.join(__dirname, '..', 'referee.html'), 'utf8') +
      fs.readFileSync(path.join(__dirname, 'refereeApp.js'), 'utf8') +
      fs.readFileSync(path.join(__dirname, 'refereeAppBase.js'), 'utf8'); // page + script extrait (#1600)
    expect(html).toContain('<script src="/js/refereeControls.js"></script>');
    expect(html).toContain('BPRefereeControls.controlButtonsState(');
    expect(html).not.toContain("timerEl.classList.add('danger')");
  });
});
