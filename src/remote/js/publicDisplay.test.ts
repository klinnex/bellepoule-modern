// @vitest-environment jsdom
/**
 * Classe PublicDisplay (/js/publicDisplay.js, extraite de public.html, #1600).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);

type Handler = (...a: unknown[]) => void;
interface FakeSocket {
  connected: boolean;
  handlers: Record<string, Handler>;
  emitted: string[];
  on(e: string, h: Handler): void;
  emit(e: string): void;
}
interface Display {
  arenaId: string;
  matchStatus: string;
  refereeSelected: boolean;
  inversionEnabled: boolean;
  showPhotos: boolean;
  handleArenaUpdate(d: unknown): void;
  updateConnectionStatus(c: boolean): void;
}

let socket: FakeSocket;
let PublicDisplay: new () => Display;

beforeEach(() => {
  document.body.innerHTML = `
    <span id="arena-number"></span><span id="arena-idle-number"></span><span id="arena-word-label"></span>
    <input type="checkbox" id="inversion-checkbox" />
    <span id="connection-dot"></span><span id="connection-text"></span>
    <span id="score-a"></span><span id="score-b"></span>`;
  localStorage.clear();
  window.history.pushState({}, '', '/arene2');
  socket = {
    connected: true,
    handlers: {},
    emitted: [],
    on(e, h) {
      this.handlers[e] = h;
    },
    emit(e) {
      this.emitted.push(e);
    },
  };
  const g = globalThis as Record<string, unknown>;
  g.io = () => socket;
  g.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  g.escHtml = (s: string) => s;
  g.T = (k: string) => k;
  g.BPArenaUtils = { setBannerLines: () => {}, applyScreenTheme: () => {} };
  g.BPPriorityDraw = { isOtherMatch: () => false };
  ({ PublicDisplay } = req('./publicDisplay.js'));
  const proto = PublicDisplay.prototype as unknown as Record<string, () => void>;
  for (const m of [
    'updateStatusBadge',
    'updateMatchDisplay',
    'updateCardsDisplay',
    'updateSuddenDeathBanner',
    'updateVisibility',
    'updateTimerDisplay',
  ]) {
    proto[m] = () => {};
  }
});

describe('publicDisplay.js PublicDisplay', () => {
  it('déduit la piste de l URL', () => {
    const d = new PublicDisplay();
    expect(d.arenaId).toBe('arena2');
    expect(document.getElementById('arena-number')?.textContent).toBe('2');
  });

  it('rejoint l arène en rôle public et s enregistre', () => {
    new PublicDisplay();
    socket.handlers.connect();
    expect(socket.emitted).toEqual(['join_arena', 'client:register']);
    expect(localStorage.getItem('bp_screen_id')).toMatch(/^scr_/);
  });

  it('affiche les scores selon l inversion locale', () => {
    const d = new PublicDisplay();
    d.handleArenaUpdate({ scoreA: 3, scoreB: 5 });
    expect(document.getElementById('score-b')?.textContent).toBe('3');
    expect(document.getElementById('score-a')?.textContent).toBe('5');
    d.inversionEnabled = true;
    d.handleArenaUpdate({ scoreA: 1, scoreB: 2 });
    expect(document.getElementById('score-a')?.textContent).toBe('1');
  });

  it('suit le statut et la sélection de l arbitre', () => {
    const d = new PublicDisplay();
    d.handleArenaUpdate({ status: 'in_progress' });
    expect(d.matchStatus).toBe('in_progress');
    expect(d.refereeSelected).toBe(true);
    d.handleArenaUpdate({ status: 'idle' });
    expect(d.refereeSelected).toBe(false);
  });

  it('signale la déconnexion', () => {
    const d = new PublicDisplay();
    d.updateConnectionStatus(false);
    expect(document.getElementById('connection-text')?.textContent).toBe('remote.disconnected');
  });

  it('public.html ne contient plus de script inline', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public.html'), 'utf8');
    expect(html).toContain('<script src="/js/publicDisplay.js"></script>');
    expect(html).not.toMatch(/<script>\s*\n/);
  });
});
