// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* eslint-disable @typescript-eslint/no-require-imports */
const { mirrorUpdate, install } = require('./refereeDemoMirror.js') as {
  mirrorUpdate: (app: FakeApp, data: Record<string, unknown>) => void;
  install: (proto: object) => void;
};
/* eslint-enable @typescript-eslint/no-require-imports */

interface FakeApp {
  [k: string]: unknown;
  matches: { id: string }[];
  currentMatch: { id: string } | null;
  scoreA: number;
  scoreB: number;
  matchStatus: string;
  swapped: boolean;
}

function fakeApp(): FakeApp {
  const app: FakeApp = {
    matches: [],
    currentMatch: null,
    scoreA: 0,
    scoreB: 0,
    matchStatus: 'not_started',
    swapped: false,
    stopTimer: vi.fn(),
    startTimer: vi.fn(),
    showNotification: vi.fn(),
    showNextMatchesScreen: vi.fn(),
    updateScores: vi.fn(),
    updateMatchStatus: vi.fn(),
    updateControlButtons: vi.fn(),
    _clearActiveMatch: vi.fn(),
  };
  app.selectMatch = vi.fn((id: string) => {
    app.currentMatch = app.matches.find(m => m.id === id) ?? null;
  });
  return app;
}

const match = { id: 'm1', fencerA: { id: 'a' }, fencerB: { id: 'b' } };

describe('tablette arbitre miroir (démo autonome)', () => {
  beforeEach(() => {
    (window as unknown as { T: (k: string) => string }).T = k => k;
    document.body.innerHTML =
      '<div id="active-match"></div><button id="btn-plus-1-a"></button><button id="btn-plus-1-b"></button>';
  });

  it('ouvre seule le match de la piste puis suit le démarrage et les scores', () => {
    const app = fakeApp();
    mirrorUpdate(app, { status: 'ready', match });
    expect(app.selectMatch).toHaveBeenCalledWith('m1');
    expect(app.startTimer).not.toHaveBeenCalled();

    mirrorUpdate(app, { status: 'in_progress', match, scoreA: 1, scoreB: 0 });
    expect(app.matchStatus).toBe('in_progress');
    expect(app.startTimer).toHaveBeenCalledTimes(1);
    expect(app.scoreA).toBe(1);
    // Touche de A (non inversé) : bouton de droite (côté b) animé
    expect(document.getElementById('btn-plus-1-b')!.classList.contains('demo-tap')).toBe(true);

    mirrorUpdate(app, { status: 'finished', match, scoreA: 5, scoreB: 3 });
    expect(app.matchStatus).toBe('finished');
    expect(app.showNotification).toHaveBeenLastCalledWith('referee.demo_match_finished');
  });

  it('piste libérée : retour à la liste', () => {
    const app = fakeApp();
    mirrorUpdate(app, { status: 'in_progress', match, scoreA: 0, scoreB: 0 });
    mirrorUpdate(app, { status: 'idle', match: null });
    expect(app._clearActiveMatch).toHaveBeenCalled();
    expect(app.showNextMatchesScreen).toHaveBeenCalled();
  });

  it('hors démo, les méthodes d’origine sont appelées', () => {
    const handle = vi.fn();
    const finish = vi.fn();
    const proto = {
      init() {},
      handleArenaUpdate: handle,
      showFinishModal: finish,
      openMatchSignature: vi.fn(),
    };
    install(proto);
    const app = Object.create(proto);
    app.demoMirror = false;
    app.handleArenaUpdate({ status: 'idle' });
    app.showFinishModal();
    expect(handle).toHaveBeenCalled();
    expect(finish).toHaveBeenCalled();
    app.demoMirror = true;
    app.showFinishModal();
    expect(finish).toHaveBeenCalledTimes(1);
  });
});
