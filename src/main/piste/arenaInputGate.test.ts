/**
 * ArenaInputGate (#1829) : barrière d'entrée des arènes, séquence par source.
 */
import { describe, it, expect, vi } from 'vitest';
import { ArenaInputGate, type GateEntry } from './arenaInputGate';
import type { PisteInput } from './types';

const dev = (piste: string, seq: number, driver = 'cyrano'): GateEntry => ({
  origin: 'device',
  source: { driver, piste },
  seq,
  kind: 'state',
});

describe('ArenaInputGate', () => {
  it('séquence croissante admise, trame en double ou désordonnée rejetée et tracée', () => {
    const gate = new ArenaInputGate({ now: () => 42 });
    expect(gate.admit('arena1', dev('1', 1))).toBe(true);
    expect(gate.admit('arena1', dev('1', 2))).toBe(true);
    expect(gate.admit('arena1', dev('1', 2))).toBe(false); // double
    expect(gate.admit('arena1', dev('1', 5))).toBe(true); // trou admis (trames perdues)
    expect(gate.admit('arena1', dev('1', 4))).toBe(false); // désordre
    expect(gate.getRejections()).toEqual([
      {
        ts: 42,
        arenaId: 'arena1',
        source: { driver: 'cyrano', piste: '1' },
        seq: 2,
        last: 2,
        kind: 'state',
      },
      {
        ts: 42,
        arenaId: 'arena1',
        source: { driver: 'cyrano', piste: '1' },
        seq: 4,
        last: 5,
        kind: 'state',
      },
    ]);
  });

  it('les entrées de la tablette passent sans contrôle', () => {
    const gate = new ArenaInputGate();
    gate.admit('arena1', dev('1', 10));
    for (let i = 0; i < 3; i++) expect(gate.admit('arena1', { origin: 'tablet' })).toBe(true);
    expect(gate.getRejections()).toHaveLength(0);
  });

  it('séquences indépendantes par source (pilote + piste) et par arène', () => {
    const gate = new ArenaInputGate();
    expect(gate.admit('arena1', dev('1', 7))).toBe(true);
    expect(gate.admit('arena1', dev('2', 1))).toBe(true); // autre piste
    expect(gate.admit('arena1', dev('1', 1, 'favero'))).toBe(true); // autre pilote
    expect(gate.admit('arena2', dev('1', 1))).toBe(true); // autre arène
    expect(gate.admit('arena1', dev('1', 7))).toBe(false);
  });

  it('séquence non numérique rejetée', () => {
    const gate = new ArenaInputGate();
    expect(gate.admit('arena1', dev('1', Number.NaN))).toBe(false);
    expect(gate.getRejections()[0].last).toBeNaN();
  });

  it('forget : un appareil redémarré reprend sa numérotation', () => {
    const gate = new ArenaInputGate();
    gate.admit('arena1', dev('1', 50));
    gate.admit('arena3', dev('1', 60));
    expect(gate.admit('arena1', dev('1', 1))).toBe(false);
    gate.forget({ driver: 'cyrano', piste: '1' });
    expect(gate.admit('arena1', dev('1', 1))).toBe(true);
    expect(gate.admit('arena3', dev('1', 1))).toBe(true);
  });

  it('journal des rejets borné', () => {
    const gate = new ArenaInputGate({ logSize: 2 });
    gate.admit('arena1', dev('1', 9));
    for (let i = 1; i <= 4; i++) gate.admit('arena1', dev('1', i));
    expect(gate.getRejections().map(r => r.seq)).toEqual([3, 4]);
  });

  it('fromInput : entrée de pilote → entrée de barrière', () => {
    const input: PisteInput = { kind: 'next', source: { driver: 'cyrano', piste: '3' }, seq: 9 };
    expect(ArenaInputGate.fromInput(input)).toEqual({
      origin: 'device',
      source: { driver: 'cyrano', piste: '3' },
      seq: 9,
      kind: 'next',
    });
  });

  it('rejet journalisé (logger.warn)', async () => {
    const { logger } = await import('../../shared/services/logger');
    const warn = vi.spyOn(logger, 'warn');
    const gate = new ArenaInputGate();
    gate.admit('arena1', dev('1', 3));
    gate.admit('arena1', dev('1', 3));
    expect(warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('n° 3 rejetée'));
    warn.mockRestore();
  });
});
