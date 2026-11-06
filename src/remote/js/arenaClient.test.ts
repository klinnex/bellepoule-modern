/**
 * Module arène /js/arenaClient.js (#1401) : identifiant d'écran, commandes serveur, état initial.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const C = req('./arenaClient.js');

const store = (init: Record<string, string> = {}) => {
  const m = { ...init };
  return {
    getItem: (k: string) => (k in m ? m[k] : null),
    setItem: (k: string, v: string) => void (m[k] = v),
    dump: () => m,
  };
};
const actions = () => ({
  reload: vi.fn(),
  navigate: vi.fn(),
  pong: vi.fn(),
  identify: vi.fn(),
  message: vi.fn(),
});

describe('arenaClient.js', () => {
  it('getOrCreateScreenId : créé une fois puis réutilisé', () => {
    const s = store();
    const id = C.getOrCreateScreenId(
      s,
      () => 0.5,
      () => 1000
    );
    expect(id).toMatch(/^scr_/);
    expect(s.dump().bp_screen_id).toBe(id);
    expect(
      C.getOrCreateScreenId(
        s,
        () => 0.9,
        () => 2000
      )
    ).toBe(id);
  });

  it('dispatchServerCommand : refresh / navigate / ping', () => {
    const a = actions();
    const ctx = { storage: store(), screenId: 'scr_x', actions: a };
    expect(C.dispatchServerCommand({ type: 'refresh' }, ctx)).toBe(true);
    expect(a.reload).toHaveBeenCalled();
    expect(C.dispatchServerCommand({ type: 'navigate', url: '/x' }, ctx)).toBe(true);
    expect(a.navigate).toHaveBeenCalledWith('/x');
    expect(C.dispatchServerCommand({ type: 'navigate' }, ctx)).toBe(false);
    C.dispatchServerCommand({ type: 'ping' }, ctx);
    expect(a.pong).toHaveBeenCalled();
  });

  it('identify : libellé commande > mémorisé > identifiant ; durée 5 s par défaut', () => {
    const a = actions();
    const s = store();
    const ctx = { storage: s, screenId: 'scr_x', actions: a };
    C.dispatchServerCommand({ type: 'identify' }, ctx);
    expect(a.identify).toHaveBeenLastCalledWith('scr_x', 5000);
    C.dispatchServerCommand({ type: 'identify', screenLabel: 'Piste 1', duration: 2000 }, ctx);
    expect(a.identify).toHaveBeenLastCalledWith('Piste 1', 2000);
    expect(s.dump().bp_screen_label).toBe('Piste 1');
    C.dispatchServerCommand({ type: 'identify' }, ctx);
    expect(a.identify).toHaveBeenLastCalledWith('Piste 1', 5000);
  });

  it('message : texte requis', () => {
    const a = actions();
    const ctx = { storage: store(), screenId: 's', actions: a };
    expect(C.dispatchServerCommand({ type: 'message' }, ctx)).toBe(false);
    C.dispatchServerCommand({ type: 'message', text: 'Hello' }, ctx);
    expect(a.message).toHaveBeenCalledWith('Hello', 5000);
    expect(C.dispatchServerCommand({ type: 'zzz' }, ctx)).toBe(false);
  });

  it('initialArenaUpdate : seulement avec un match et un tireur A', () => {
    expect(C.initialArenaUpdate(null)).toBeNull();
    expect(C.initialArenaUpdate({ currentMatch: {} })).toBeNull();
    const u = C.initialArenaUpdate({
      currentMatch: { fencerA: { id: 1 } },
      status: 'ready',
      scoreA: 1,
      scoreB: 2,
    });
    expect(u).toMatchObject({ status: 'ready', scoreA: 1, scoreB: 2 });
  });

  it('isOlympicSession', () => {
    expect(C.isOlympicSession(null)).toBe(false);
    expect(C.isOlympicSession({ weapon: 'E' })).toBe(true);
    expect(C.isOlympicSession({ weapon: 'L' })).toBe(false);
    expect(C.isOlympicSession({ weapon: 'L', modernRules: true })).toBe(true);
  });

  it('arena.html charge le module', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'arena.html'), 'utf8');
    expect(html).toContain('<script src="/js/arenaClient.js"></script>');
    expect(html).toContain('ArenaClient.dispatchServerCommand(');
    expect(html).not.toContain("localStorage.getItem('bp_screen_id')");
  });
});
