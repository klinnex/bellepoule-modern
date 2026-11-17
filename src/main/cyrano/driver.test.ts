/**
 * Pilote Cyrano du modèle commun (#1829) : conversion des deux sens, séquence par piste,
 * commandes ; barrière d'entrée appliquée par le PisteHub.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { buildCyrano, parseCyrano, type CyranoMessage } from './codec';
import { CyranoServer } from './server';
import {
  CyranoPisteDriver,
  cyranoToPisteState,
  formatCyranoStopwatch,
  pisteDisplayToDisp,
} from './driver';
import { PisteHub } from '../piste/pisteHub';
import type {
  PisteDisplay,
  PisteDriver,
  PisteDriverEvents,
  PisteInput,
  PisteLink,
} from '../piste/types';
import type { RemoteScoreServer } from '../remoteScoreServer';

const INFO: CyranoMessage = {
  protocol: 'EFP1.1',
  command: 'INFO',
  piste: '1',
  compe: 'C1',
  round: '2',
  stopwatch: '0:09.53',
  type: 'T',
  weapon: 'S',
  priority: 'L',
  state: 'F',
  right: {
    id: 'aaaaaaaa',
    name: 'DUVAL J',
    nat: 'FRA',
    score: 12,
    status: 'U',
    yellowCards: 1,
    redCards: 2,
    light: true,
    whiteLight: false,
    medical: 1,
    reserve: true,
    pCard: 3,
  },
  left: { id: 'bbbbbbbb', score: 9, status: 'A', pCard: 4 },
};

describe('Conversion Cyrano → état normalisé', () => {
  it('INFO complet : état, chrono en secondes, priorité, type, relais, côtés', () => {
    expect(cyranoToPisteState(INFO)).toEqual({
      state: 'fencing',
      stopwatch: 9.53,
      priority: 'left',
      type: 'team',
      round: 2,
      right: {
        id: 'aaaaaaaa',
        name: 'DUVAL J',
        nat: 'FRA',
        score: 12,
        status: 'normal',
        yellowCards: 1,
        redCards: 2,
        pRed: 2,
        light: true,
        whiteLight: false,
        medical: 1,
        reserve: true,
      },
      left: { id: 'bbbbbbbb', score: 9, status: 'abandon', pBlack: 1 },
    });
  });

  it('états, statuts et cartons P (0 à 5)', () => {
    const st = (state: CyranoMessage['state']) =>
      cyranoToPisteState({ ...INFO, state, right: undefined, left: undefined }).state;
    expect(['F', 'H', 'P', 'W', 'E'].map(s => st(s as CyranoMessage['state']))).toEqual([
      'fencing',
      'halt',
      'pause',
      'waiting',
      'ending',
    ]);
    const p = (pCard: number) => cyranoToPisteState({ ...INFO, right: { id: 'x', pCard } }).right;
    expect([0, 1, 2, 3, 4, 5].map(p)).toEqual([
      { id: 'x' },
      { id: 'x', pYellow: 1 },
      { id: 'x', pRed: 1 },
      { id: 'x', pRed: 2 },
      { id: 'x', pBlack: 1 },
      { id: 'x', pBlack: 2 },
    ]);
    const statuses = (['U', 'V', 'D', 'A', 'E'] as const).map(
      status => cyranoToPisteState({ ...INFO, right: { id: 'x', status } }).right?.status
    );
    expect(statuses).toEqual(['normal', 'victory', 'defeat', 'abandon', 'exclusion']);
  });

  it('INFO minimal : champs absents omis (pas de priorité inventée)', () => {
    const minimal = parseCyrano('|EFP1.1|INFO|1||%|')!;
    expect(cyranoToPisteState(minimal)).toEqual({});
    expect(cyranoToPisteState({ ...minimal, priority: 'N' })).toEqual({ priority: 'none' });
    expect(cyranoToPisteState({ ...minimal, stopwatch: '9:99', round: 'x' })).toEqual({});
  });
});

describe('Conversion affichage → DISP', () => {
  const display: PisteDisplay = {
    type: 'individual',
    phase: 1,
    poulTab: '2',
    match: 3,
    weapon: 'E',
    stopwatch: 80,
    right: {
      id: '7ca21969-e092',
      lastName: 'Duval',
      firstName: 'Jean',
      nat: 'FRA',
      score: 4,
      yellowCards: 1,
    },
    left: {
      id: '08f01fd6-ae32',
      lastName: 'Faure',
      firstName: 'Marc',
      nat: 'ITA',
      score: 2,
      redCards: 2,
      pRed: 1,
    },
    referee: { id: 'r1', name: 'ARBITRE' },
  };

  it('individuel : chrono m:ss, cartons, carton P (rouge = 2, noir = 4)', () => {
    const d = pisteDisplayToDisp(display);
    expect(d).toMatchObject({
      phase: '1',
      poulTab: '2',
      match: '3',
      round: '1',
      stopwatch: '1:20',
      type: 'I',
      weapon: 'E',
      right: { id: '7ca21969-e092', score: 4, yellowCards: 1 },
      left: { score: 2, redCards: 2, pCard: 2 },
    });
    expect(d.right).not.toHaveProperty('pCard');
    const black = pisteDisplayToDisp({ ...display, left: { ...display.left, pRed: 2, pBlack: 1 } });
    expect(black.left?.pCard).toBe(4);
  });

  it('équipes : Type=T, Round = n° du relais, phase / poule / match omis', () => {
    const d = pisteDisplayToDisp({
      ...display,
      type: 'team',
      round: 4,
      phase: undefined,
      poulTab: undefined,
      match: undefined,
      stopwatch: undefined,
    });
    const frame = buildCyrano({ ...d, protocol: 'EFP1.1', command: 'DISP', piste: '1', compe: '' });
    expect(parseCyrano(frame)).toMatchObject({ type: 'T', round: '4' });
    expect(parseCyrano(frame)?.phase).toBeUndefined();
    expect(d.stopwatch).toBeUndefined();
  });

  it('chrono : m:ss, centièmes sous 10 s, arrondi', () => {
    expect(formatCyranoStopwatch(180)).toBe('3:00');
    expect(formatCyranoStopwatch(9.53)).toBe('0:09.53');
    // Sous 10 s : centièmes obligatoires en EFP1.1 (spéc. § 3, champ 10)
    expect(formatCyranoStopwatch(9)).toBe('0:09.00');
    expect(formatCyranoStopwatch(59.999)).toBe('1:00');
    expect(formatCyranoStopwatch(9.999)).toBe('0:10');
    expect(formatCyranoStopwatch(-3)).toBe('0:00.00');
  });
});

describe('CyranoPisteDriver', () => {
  const IP = '10.0.0.9';
  const setup = () => {
    const server = new CyranoServer();
    server.setPistes([{ piste: '1', ip: IP, arena: 2 }]);
    const driver = new CyranoPisteDriver(server);
    const inputs: [PisteInput, PisteLink][] = [];
    driver.on('input', (input, link) => inputs.push([input, link]));
    return { server, driver, inputs };
  };

  it('INFO / NEXT / PREV → entrées numérotées par piste, liaison jointe', () => {
    const { server, inputs } = setup();
    server.handle(buildCyrano(INFO), IP, 50100);
    server.handle('|EFP1.1|NEXT|1||%|', IP, 50100);
    server.handle('|EFP1.1|PREV|1||%|', IP, 50100);
    expect(inputs.map(([i]) => [i.kind, i.seq, i.source])).toEqual([
      ['state', 1, { driver: 'cyrano', piste: '1' }],
      ['next', 2, { driver: 'cyrano', piste: '1' }],
      ['prev', 3, { driver: 'cyrano', piste: '1' }],
    ]);
    expect(inputs[0][1]).toMatchObject({ piste: '1', arena: 2, mode: 'master', status: 'online' });
    const first = inputs[0][0];
    expect(first.kind === 'state' && first.state.right?.pRed).toBe(2);
  });

  it('commandes → DISP / DISP vide / ACK / NAK, épreuve transmise', () => {
    const { server, driver } = setup();
    const disp = vi.spyOn(server, 'sendDisp').mockReturnValue(true);
    const ack = vi.spyOn(server, 'sendAck').mockReturnValue(true);
    const nak = vi.spyOn(server, 'sendNak').mockReturnValue(true);
    driver.setNameLength(15);
    driver.send('1', {
      kind: 'display',
      display: {
        type: 'individual',
        weapon: 'F',
        right: { id: 'a', lastName: 'Montgolfier', firstName: 'Jacques' },
        left: { id: 'b', lastName: 'B', firstName: 'C' },
      },
      competition: 'cmp-2',
    });
    expect(disp).toHaveBeenLastCalledWith(
      '1',
      expect.objectContaining({
        weapon: 'F',
        right: expect.objectContaining({ name: 'MONTGOLFIER J' }),
      }),
      'cmp-2'
    );
    driver.send('1', { kind: 'clear' });
    expect(disp).toHaveBeenLastCalledWith('1', {});
    driver.send('1', { kind: 'ack' });
    driver.send('1', { kind: 'nak' });
    expect(ack).toHaveBeenCalledWith('1');
    expect(nak).toHaveBeenCalledWith('1');
  });

  it('identifiant tronqué à 8 caractères, liaison et statuts relayés, dispose', () => {
    const { server, driver, inputs } = setup();
    expect(driver.fencerId('7ca21969-e092-4bdc')).toBe('7ca21969');
    expect(driver.findPiste('1')).toMatchObject({ arena: 2 });
    expect(driver.findAllByArena(2)).toHaveLength(1);
    expect(driver.getStatuses()).toHaveLength(1);
    const statuses: PisteLink[] = [];
    driver.on('status', l => statuses.push(l));
    server.handle(buildCyrano(INFO), IP, 50100);
    expect(statuses.map(s => s.status)).toEqual(['online']);
    driver.dispose();
    server.handle(buildCyrano(INFO), IP, 50100);
    expect(inputs).toHaveLength(1);
  });
});

/** Pilote factice : entrées injectées avec un numéro de séquence choisi. */
class FakeDriver extends EventEmitter<PisteDriverEvents> implements PisteDriver {
  readonly id = 'fake';
  readonly capabilities = {
    names: true,
    remote: true,
    ack: true,
    chrono: true,
    pCards: false,
    teams: false,
  };
  link: PisteLink = { piste: 'p1', arena: 1, mode: 'master', status: 'online' };
  sent: unknown[] = [];
  getStatuses = () => [this.link];
  findPiste = (p: string) => (p === this.link.piste ? this.link : undefined);
  findAllByArena = (n: number) => (n === this.link.arena ? [this.link] : []);
  send = (_p: string, c: unknown) => (this.sent.push(c), true);
  fencerId = (id: string) => id.slice(0, 4);
}

describe('PisteHub + ArenaInputGate', () => {
  it('entrée de séquence déjà vue : rejetée avant l’arène, tracée', async () => {
    const driver = new FakeDriver();
    const control = vi.fn();
    const match = {
      id: 'm1',
      fencerA: { id: 'aaaa-1', firstName: 'A', lastName: 'A' },
      fencerB: { id: 'bbbb-2', firstName: 'B', lastName: 'B' },
      scoreA: 0,
      scoreB: 0,
    };
    const remote = {
      getArena: () => ({ status: 'in_progress', currentMatch: match }),
      hasArenaAssignment: () => true,
      hasSession: () => true,
      getSession: () => ({ competitionId: 'c1' }),
      getSessionWeapon: () => 'E',
      handleArenaControl: control,
      updateArena: vi.fn(),
      arenaCards: new Map(),
    } as unknown as RemoteScoreServer;
    const hub = new PisteHub(driver, () => remote);
    hub.attach();
    const input = (seq: number, a: number): PisteInput => ({
      kind: 'state',
      source: { driver: 'fake', piste: 'p1' },
      seq,
      state: {
        state: 'halt',
        right: { id: 'aaaa', score: a },
        left: { id: 'bbbb', score: 0 },
      },
    });
    driver.emit('input', input(1, 1), driver.link);
    expect(control).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'cyrano:p1' }),
      expect.objectContaining({ action: 'update_score', scoreA: 1 })
    );
    const calls = control.mock.calls.length;
    driver.emit('input', input(1, 3), driver.link); // double
    driver.emit('input', input(0, 4), driver.link); // en retard
    expect(control.mock.calls.length).toBe(calls);
    expect(hub.gate.getRejections().map(r => r.seq)).toEqual([1, 0]);
    driver.emit('input', input(2, 5), driver.link);
    expect(control).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'update_score', scoreA: 5 })
    );
    // Liaison perdue : l'appareil redémarré peut reprendre à 1
    driver.emit('status', { ...driver.link, status: 'offline' });
    driver.emit('input', input(1, 6), { ...driver.link });
    expect(hub.gate.getRejections()).toHaveLength(2);
    // Remplaçant demandé en individuel : refusé, tracé une fois par demande
    const { logger } = await import('../../shared/services/logger');
    const warn = vi.spyOn(logger, 'warn');
    const reserve = (seq: number, flag: boolean): PisteInput => {
      const i = input(seq, 6);
      if (i.kind === 'state' && i.state.left) i.state.left.reserve = flag;
      return i;
    };
    driver.emit('input', reserve(2, true), driver.link);
    driver.emit('input', reserve(3, true), driver.link);
    const refused = () =>
      warn.mock.calls.filter(c =>
        String(c[1]).includes('remplaçant refusé : épreuve individuelle')
      );
    expect(refused()).toHaveLength(1);
    driver.emit('input', reserve(4, false), driver.link);
    driver.emit('input', reserve(5, true), driver.link);
    expect(refused()).toHaveLength(2);
    warn.mockRestore();
    hub.detach();
  });
});
