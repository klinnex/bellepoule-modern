// @vitest-environment jsdom
/**
 * Classe ArenaDisplay (/js/arenaDisplay.js, extraite de arena.html, #1600) : connexion, thème, mise à jour.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);

type Handler = (...a: unknown[]) => void;
interface FakeSocket {
  connected: boolean;
  handlers: Record<string, Handler>;
  emitted: [string, unknown][];
  on(e: string, h: Handler): void;
  emit(e: string, p?: unknown): void;
}

function makeSocket(): FakeSocket {
  return {
    connected: true,
    handlers: {},
    emitted: [],
    on(e, h) {
      this.handlers[e] = h;
    },
    emit(e, p) {
      this.emitted.push([e, p]);
    },
  };
}

let socket: FakeSocket;
let planArenaUpdate: ReturnType<typeof vi.fn>;
let ArenaDisplay: new () => {
  arenaId: string;
  matchStatus: string;
  handleArenaUpdate(d: unknown): void;
  updateConnectionStatus(c: boolean): void;
};

beforeEach(() => {
  document.body.innerHTML = `
    <div class="header"></div>
    <span id="arena-number"></span><span id="arena-idle-number"></span><span id="arena-strip-number"></span>
    <input type="checkbox" id="inversion-checkbox" />
    <span id="connection-dot"></span><span id="connection-text"></span>
    <span id="score-a"></span><span id="score-b"></span>`;
  window.history.pushState({}, '', '/arene3');
  socket = makeSocket();
  planArenaUpdate = vi.fn();
  const g = globalThis as Record<string, unknown>;
  g.io = () => socket;
  g.bpSocket = () => socket;
  g.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  g.escHtml = (s: string) => s;
  g.T = (k: string) => k;
  g.BPArenaUtils = {
    setBannerLines: () => {},
    arenaIdFromPath: (p: string) => `arena${/arene(\d+)/.exec(p)?.[1]}`,
    applyArenaTheme: (_d: unknown, _s: unknown, theme: string) => theme,
  };
  g.ArenaClient = {
    isOlympicSession: () => false,
    initialArenaUpdate: () => null,
    getOrCreateScreenId: () => 'screen-1',
    dispatchServerCommand: () => {},
  };
  g.ArenaUpdate = { planArenaUpdate };
  g.BPArenaOverlays = {};
  g.BPArenaRender = {};
  g.BPArenaPanels = {};
  vi.resetModules();
  ({ ArenaDisplay } = req('./arenaDisplay.js'));
});

describe('arenaDisplay.js ArenaDisplay', () => {
  it('déduit la piste de l URL et affiche son numéro', () => {
    const d = new ArenaDisplay();
    expect(d.arenaId).toBe('arena3');
    expect(document.getElementById('arena-number')?.textContent).toBe('3');
  });

  it('rejoint l arène et s enregistre à la connexion', () => {
    new ArenaDisplay();
    socket.handlers.connect();
    expect(socket.emitted.map(e => e[0])).toEqual(['join_arena', 'client:register']);
    expect(document.getElementById('connection-text')?.textContent).toBe('remote.connected');
  });

  it('applique les opérations du plan de mise à jour', () => {
    const d = new ArenaDisplay();
    planArenaUpdate.mockReturnValue([
      { op: 'set', key: 'matchStatus', value: 'fighting' },
      { op: 'score', id: 'score-a', value: '4' },
    ]);
    d.handleArenaUpdate({});
    expect(d.matchStatus).toBe('fighting');
    expect(document.getElementById('score-a')?.textContent).toBe('4');
  });

  it('signale la déconnexion', () => {
    const d = new ArenaDisplay();
    d.updateConnectionStatus(false);
    expect(document.getElementById('connection-text')?.textContent).toBe('remote.disconnected');
  });

  it('arena.html ne contient plus de script inline', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'arena.html'), 'utf8');
    expect(html).toContain('<script src="/js/arenaDisplay.js"></script>');
    expect(html).not.toMatch(/<script>\s*\n/);
  });
});
