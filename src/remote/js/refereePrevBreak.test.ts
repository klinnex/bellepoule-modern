/**
 * Module /js/refereePrevBreak.js (#2001) : bouton PREV de la tablette (verdict du serveur) et
 * pause sabre à 8 touches (minute de repos, chrono restauré à la fin).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const M = req('./refereePrevBreak.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'referee.html'), 'utf8');
const base = fs.readFileSync(path.join(__dirname, 'refereeAppBase.js'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

describe('prevFeedback', () => {
  it('succès : notification normale', () => {
    expect(M.prevFeedback({ ok: true })).toEqual({ key: 'referee.prev_ok', isError: false });
  });
  it('refus : un message par motif, erreur par défaut', () => {
    expect(M.prevFeedback({ ok: false, reason: 'in_progress' }).key).toBe(
      'referee.prev_in_progress'
    );
    expect(M.prevFeedback({ ok: false, reason: 'expired' }).key).toBe('referee.prev_expired');
    expect(M.prevFeedback({ ok: false, reason: 'none' }).key).toBe('referee.prev_none');
    expect(M.prevFeedback({ ok: false, reason: 'error' })).toEqual({
      key: 'referee.prev_error',
      isError: true,
    });
    expect(M.prevFeedback(undefined)).toEqual({ key: 'referee.prev_error', isError: true });
  });
});

describe('sabreBreakPlan', () => {
  const base = {
    hasMatch: true,
    matchStatus: 'in_progress',
    isResting: false,
    deviceMaster: false,
  };
  it('démarre sur la tablette pendant un match en cours', () => {
    expect(M.sabreBreakPlan(base)).toBe('start');
  });
  it('laisse la pause à l’appareil maître', () => {
    expect(M.sabreBreakPlan({ ...base, deviceMaster: true })).toBe('device');
  });
  it('ignore sans match, hors match en cours ou pendant un repos', () => {
    expect(M.sabreBreakPlan({ ...base, hasMatch: false })).toBe('ignore');
    expect(M.sabreBreakPlan({ ...base, matchStatus: 'not_started' })).toBe('ignore');
    expect(M.sabreBreakPlan({ ...base, isResting: true })).toBe('ignore');
  });
});

describe('install sur la tablette', () => {
  let proto: Record<string, unknown>;
  let app: Record<string, unknown> & { [k: string]: any };
  beforeEach(() => {
    (globalThis as any).window = { T: (k: string) => k };
    proto = {
      endRest: vi.fn(function (this: any) {
        this.isResting = false;
        this._timerCs = 18000;
      }),
    };
    M.install(proto);
    app = Object.create(proto);
    Object.assign(app, {
      socket: { emit: vi.fn() },
      arenaId: 'a1',
      currentMatch: { id: 'm1' },
      matchStatus: 'in_progress',
      isResting: false,
      cyranoMasterLock: false,
      _timerCs: 12345,
      showNotification: vi.fn(),
      stopTimer: vi.fn(),
      startTimer: vi.fn(),
      updateControlButtons: vi.fn(),
      updateTimerDisplay: vi.fn(),
      broadcastTimerUpdate: vi.fn(),
      timerSeconds: 0,
    });
  });

  it('requestPrevMatch émet arena_control prev', () => {
    app.requestPrevMatch();
    expect(app.socket.emit).toHaveBeenCalledWith('arena_control', {
      arenaId: 'a1',
      action: 'prev',
    });
  });

  it('onPrevResult affiche le refus en erreur', () => {
    app.onPrevResult({ ok: false, reason: 'expired' });
    expect(app.showNotification).toHaveBeenCalledWith('referee.prev_expired', true);
  });

  it('pause sabre : chrono arrêté, repos de 60 s lancé, chrono restauré à la fin du repos', () => {
    app.onSabreBreak({ seconds: 60 });
    expect(app.stopTimer).toHaveBeenCalled();
    expect(app.isResting).toBe(true);
    expect(app.timerSeconds).toBe(60);
    expect(app.startTimer).toHaveBeenCalled();
    app.endRest();
    expect(app._timerCs).toBe(12345);
    expect(app.isResting).toBe(false);
  });

  it('pause sabre avec appareil maître : annonce seulement', () => {
    app.cyranoMasterLock = true;
    app.onSabreBreak({ seconds: 60 });
    expect(app.showNotification).toHaveBeenCalledWith('referee.sabre_break_notif');
    expect(app.stopTimer).not.toHaveBeenCalled();
    expect(app.isResting).toBe(false);
  });

  it('un repos classique (sans pause sabre) garde son comportement', () => {
    app.endRest();
    expect(app._timerCs).toBe(18000);
  });
});

describe('câblage de la page', () => {
  it('bouton, script, écouteurs et cache hors-ligne', () => {
    expect(html).toContain('id="btn-prev-match"');
    expect(html).toContain('data-click="refereeApp.requestPrevMatch"');
    expect(html).toContain('<script src="/js/refereePrevBreak.js"></script>');
    expect(base).toContain(':prev_result`');
    expect(base).toContain(':sabre_break`');
    expect(sw).toContain('/js/refereePrevBreak.js');
  });
});
