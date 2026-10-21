import { describe, it, expect } from 'vitest';
import type { Arena } from '../../shared/types/remote';
import {
  ArenaSlotRegistry,
  MAX_SLOTS_PER_ARENA,
  baseArenaId,
  createSlotArena,
  isSlotArenaId,
  matchesTakenBySiblings,
} from './arenaSlots';

const arena = (id: string, extra: Partial<Arena> = {}): Arena => ({
  id,
  name: `Arène ${id}`,
  number: Number(/\d+/.exec(id)?.[0] ?? 1),
  currentMatch: null,
  status: 'idle',
  startTime: null,
  settings: { matchDuration: 180, breakDuration: 30, autoAdvance: false },
  ...extra,
});

const match = (id: string) => ({ id }) as Arena['currentMatch'];

function setup() {
  const arenas = new Map<string, Arena>([
    ['arena1', arena('arena1', { password: 'scrypt$x$y', activePoolId: 'p1' })],
    ['arena2', arena('arena2')],
  ]);
  const create = (parent: Arena, slot: number) => {
    const a = createSlotArena(parent, slot);
    arenas.set(a.id, a);
    return a;
  };
  return { arenas, create, registry: new ArenaSlotRegistry() };
}

describe('sous-pistes des rapières (#1118)', () => {
  it('identifiants : piste de base et détection', () => {
    expect(baseArenaId('arena3s2')).toBe('arena3');
    expect(baseArenaId('arena3')).toBe('arena3');
    expect(baseArenaId('arena3s')).toBe('arena3s');
    expect(isSlotArenaId('arena12s10')).toBe(true);
    expect(isSlotArenaId('arena12')).toBe(false);
  });

  it('copie de la piste : numéro, mot de passe, poule, état vierge', () => {
    const { arenas } = setup();
    const slot = createSlotArena(arenas.get('arena1')!, 3);
    expect(slot).toMatchObject({
      id: 'arena1s3',
      number: 1,
      password: 'scrypt$x$y',
      activePoolId: 'p1',
      status: 'idle',
      currentMatch: null,
    });
  });

  it('attribution : piste puis sous-pistes, stable par tablette, piste occupée sautée', () => {
    const { arenas, create, registry } = setup();
    expect(registry.claim(arenas, 'arena1', 'A', create)).toBe('arena1');
    expect(registry.claim(arenas, 'arena1', 'B', create)).toBe('arena1s2');
    expect(registry.claim(arenas, 'arena1', 'A', create)).toBe('arena1');
    arenas.set('arena1s3', arena('arena1s3', { status: 'in_progress' }));
    expect(registry.claim(arenas, 'arena1', 'C', create)).toBe('arena1s4');
    expect(registry.claim(arenas, 'arena9', 'A', create)).toBeNull();
  });

  it('préférence pour la sous-piste actuelle, plafond par piste', () => {
    const { arenas, create, registry } = setup();
    create(arenas.get('arena1')!, 5);
    expect(registry.claim(arenas, 'arena1', 'A', create, 'arena1s5')).toBe('arena1s5');
    expect(registry.claim(arenas, 'arena1', 'B', create, 'arena1s5')).toBe('arena1');
    for (let i = 0; i < MAX_SLOTS_PER_ARENA; i++) registry.claim(arenas, 'arena1', `k${i}`, create);
    expect(registry.claim(arenas, 'arena1', 'Z', create)).toBeNull();
  });

  it('libération : seules les sous-pistes sans match en cours', () => {
    const { arenas, create, registry } = setup();
    registry.claim(arenas, 'arena1', 'A', create);
    registry.claim(arenas, 'arena1', 'B', create);
    arenas.get('arena1s2')!.currentMatch = match('m1');
    arenas.get('arena1s2')!.status = 'in_progress';
    registry.release(arenas);
    expect(registry.claim(arenas, 'arena1', 'C', create)).toBe('arena1');
    expect(registry.claim(arenas, 'arena1', 'B', create)).toBe('arena1s2');
  });

  it('matchs pris par les autres sous-pistes (terminés exclus)', () => {
    const { arenas, create } = setup();
    arenas.get('arena1')!.currentMatch = match('m1');
    create(arenas.get('arena1')!, 2).currentMatch = match('m2');
    const done = create(arenas.get('arena1')!, 3);
    done.currentMatch = match('m3');
    done.status = 'finished';
    arenas.get('arena2')!.currentMatch = match('m4');
    const opened = () => true;
    expect([...matchesTakenBySiblings(arenas, 'arena1s2', opened)]).toEqual(['m1']);
    expect([...matchesTakenBySiblings(arenas, 'arena1', opened)].sort()).toEqual(['m2']);
  });

  it('match seulement préchargé (ni ouvert, ni chrono lancé) : pas pris', () => {
    const { arenas, create } = setup();
    arenas.get('arena1')!.currentMatch = match('m1');
    const slot = create(arenas.get('arena1')!, 2);
    slot.currentMatch = match('m2');
    const none = () => false;
    expect([...matchesTakenBySiblings(arenas, 'arena1s3', none)]).toEqual([]);
    expect([...matchesTakenBySiblings(arenas, 'arena1s3', id => id === 'arena1s2')]).toEqual([
      'm2',
    ]);
    slot.currentMatch = { id: 'm2', startTime: new Date() } as Arena['currentMatch'];
    expect([...matchesTakenBySiblings(arenas, 'arena1s3', none)]).toEqual(['m2']);
  });
});
