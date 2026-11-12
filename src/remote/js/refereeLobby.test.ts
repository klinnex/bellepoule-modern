/**
 * Module arbitre /js/refereeLobby.js (#1500) : lien avec le lobby du mode entraînement.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const L = req('./refereeLobby.js');

describe('refereeLobby.js', () => {
  it('arenaFromPath : /areneN/arbitre et /arenaN', () => {
    expect(L.arenaFromPath('/arene3/arbitre')).toBe(3);
    expect(L.arenaFromPath('/arena12/referee')).toBe(12);
    expect(L.arenaFromPath('/lobby')).toBeNull();
  });

  it('clientId : généré puis conservé dans le stockage', () => {
    const data: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => (data[k] = v),
    };
    const id = L.clientId(storage);
    expect(id).toMatch(/^[\w-]{8,64}$/);
    expect(L.clientId(storage)).toBe(id);
  });

  it('clientId : stockage indisponible toléré', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(L.clientId(storage)).toMatch(/^[\w-]{8,64}$/);
  });

  it("createIdleTracker : expire après 3 minutes, l'activité repousse", () => {
    let t = 0;
    const tr = L.createIdleTracker(() => t, L.IDLE_MS);
    t = L.IDLE_MS - 1;
    expect(tr.expired()).toBe(false);
    tr.activity();
    t = L.IDLE_MS * 2 - 2;
    expect(tr.expired()).toBe(false);
    t = L.IDLE_MS * 2 - 1;
    expect(tr.expired()).toBe(true);
  });

  it("createIdleTracker : chrono en cours = actif (jamais d'expiration)", () => {
    let t = 0;
    let busy = true;
    const tr = L.createIdleTracker(
      () => t,
      L.IDLE_MS,
      () => busy
    );
    t = L.IDLE_MS * 5;
    expect(tr.expired()).toBe(false);
    busy = false;
    t += L.IDLE_MS;
    expect(tr.expired()).toBe(true);
  });

  it('install : hors entraînement, rien (pas de claim, pas de bouton)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ json: async () => ({ training: false }) });
    const win = {
      location: { pathname: '/arene1/arbitre', search: '' },
      fetch: fetchFn,
      sessionStorage: { getItem: () => null, setItem: () => undefined },
      document: { getElementById: () => null },
    };
    expect(await L.install(win, () => null)).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('install : miroir de démo (?demo=1) ignoré', async () => {
    const fetchFn = vi.fn();
    const win = { location: { pathname: '/arene1/arbitre', search: '?demo=1' }, fetch: fetchFn };
    expect(await L.install(win, () => null)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('install : piste occupée (409) → redirection vers le lobby', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ training: true, idleMs: 180000 }) })
      .mockResolvedValueOnce({ status: 409 });
    const replace = vi.fn();
    const win = {
      location: { pathname: '/arene2/arbitre', search: '', replace },
      fetch: fetchFn,
      sessionStorage: { getItem: () => null, setItem: () => undefined },
      document: { getElementById: () => null },
    };
    expect(await L.install(win, () => null)).toBe(true);
    expect(replace).toHaveBeenCalledWith('/entrainement-lobby?occupied=2');
  });
});

describe('refereeLobby.js : arrivée depuis le lobby → vue arbitre du match (#1500)', () => {
  it('fromLobby : ?lobby=1 uniquement', () => {
    expect(L.fromLobby('?lobby=1')).toBe(true);
    expect(L.fromLobby('')).toBe(false);
    expect(L.fromLobby('?demo=1')).toBe(false);
  });

  it('pickMatch : en cours prioritaire, sinon premier à jouer, sinon null', () => {
    const a = { id: 'a', status: 'not_started' };
    const b = { id: 'b', status: 'in_progress' };
    expect(L.pickMatch([a, b])).toBe(b);
    expect(L.pickMatch([a])).toBe(a);
    expect(L.pickMatch([{ id: 'c', status: 'finished' }])).toBeNull();
    expect(L.pickMatch(undefined)).toBeNull();
  });

  function lobbyWin() {
    const replaceState = vi.fn();
    return {
      replaceState,
      win: {
        location: { href: 'http://h:8066/arene3/arbitre?lobby=1' },
        history: { replaceState },
        setTimeout: (fn: () => void) => fn(),
      },
    };
  }

  it('autoOpen : ouvre le match une fois la liste chargée et retire ?lobby=1', async () => {
    const { win, replaceState } = lobbyWin();
    // État initial réel : allMatches = [] avant le chargement (#1500)
    const app: Record<string, unknown> = { currentMatch: null, allMatches: [] };
    const select = vi.fn();
    let calls = 0;
    const getApp = () => {
      if (++calls === 3) {
        app.allMatches = [{ id: 'm1', status: 'not_started' }];
        app.matchesLoaded = true;
      }
      app.selectMatchFromNextScreen = select;
      return app;
    };
    expect(await L.autoOpen(win, getApp)).toBe(true);
    expect(select).toHaveBeenCalledWith('m1');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/arene3/arbitre');
  });

  it('autoOpen : match déjà ouvert ou liste vide → rien', async () => {
    const select = vi.fn();
    const busy = { currentMatch: { id: 'x' }, allMatches: [], selectMatchFromNextScreen: select };
    expect(await L.autoOpen(lobbyWin().win, () => busy)).toBe(false);
    const empty = {
      currentMatch: null,
      allMatches: [],
      matchesLoaded: true,
      selectMatchFromNextScreen: select,
    };
    expect(await L.autoOpen(lobbyWin().win, () => empty)).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });

  it('autoOpen : liste jamais chargée → abandon après les essais', async () => {
    expect(await L.autoOpen(lobbyWin().win, () => null, 3)).toBe(false);
  });
});

describe('referee.html et trainingLobby.html (#1500)', () => {
  const dir = path.join(__dirname, '..');
  const referee =
    fs.readFileSync(path.join(dir, 'referee.html'), 'utf8') +
    fs.readFileSync(path.join(dir, 'js', 'refereeApp.js'), 'utf8') +
    fs.readFileSync(path.join(dir, 'js', 'refereeAppBase.js'), 'utf8'); // page + script extrait (#1600)
  const lobby = fs.readFileSync(path.join(dir, 'trainingLobby.html'), 'utf8');

  it('referee.html charge le module et lance install', () => {
    expect(referee).toContain('/js/refereeLobby.js');
    expect(referee).toContain('BPRefereeLobby.install');
  });

  it('page lobby : pistes via l’API, lien vers l’arbitrage, i18n et common.js', () => {
    expect(lobby).toContain('/api/training/lobby');
    expect(lobby).toContain("'/arene' + encodeURIComponent(a.number) + '/arbitre?lobby=1'");
    expect(lobby).toContain('traininglobby.occupied');
    expect(lobby).toContain('<script src="/i18n.js"></script>');
    expect(lobby).not.toMatch(/innerHTML/);
  });
});
