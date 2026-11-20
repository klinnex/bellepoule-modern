import { describe, it, expect, beforeEach } from 'vitest';
import { MqttBroker } from './mqttBroker';
import { Opp2PisteDriver } from './driver';
import { MultiPisteDriver } from '../piste/multiDriver';
import type { PisteDisplay, PisteInput, PisteLink, PisteState } from '../piste/types';

const T = (m: string, role = 'apparatus', piste = '3') => `openpiste/${piste}/${role}/${m}`;
const H = (seq: number, ts = 1000) => ({ protocol: 'OPP2', version: '1.0', seq, ts });
const DISPLAY: PisteDisplay = {
  type: 'individual',
  phase: 1,
  poulTab: '2',
  match: 5,
  weapon: 'E',
  right: { id: 'uuid-right-1234', lastName: 'Martin', firstName: 'Paul', nat: 'FRA', score: 1 },
  left: { id: 'uuid-left-5678', lastName: 'Panini', firstName: 'Bruno', nat: 'Roma CS' },
  referee: { id: 'r1', name: 'J. Smith' },
};

describe('pilote OPP2 (#1960)', () => {
  let broker: MqttBroker;
  let driver: Opp2PisteDriver;
  let inputs: PisteInput[];
  let links: PisteLink[];
  const pub = (topic: string, body: object, retain = true) =>
    broker.publish(topic, JSON.stringify(body), { qos: 1, retain });
  const lastState = (): PisteState => {
    const s = [...inputs].reverse().find(i => i.kind === 'state');
    return (s as Extract<PisteInput, { kind: 'state' }>).state;
  };
  const softwareMessages = () => {
    const out: Record<string, Record<string, unknown>> = {};
    broker.subscribe(
      'openpiste/3/software/#',
      (t, p) => (out[t.split('/')[3]] = JSON.parse(p.toString()))
    );
    return out;
  };

  beforeEach(() => {
    broker = new MqttBroker();
    driver = new Opp2PisteDriver(broker, {
      now: () => 5000,
      software: { name: 'BP', version: '3' },
    });
    driver.setPistes([{ piste: '3', arena: 3 }]);
    inputs = [];
    links = [];
    driver.on('input', i => inputs.push(i));
    driver.on('status', l => links.push(l));
  });

  it('démarrage : BellePoule annoncé (retenu), appareil en ligne via apparatus/connection', () => {
    driver.start();
    expect(JSON.parse(broker.getRetained(T('connection', 'software'))!.toString())).toMatchObject({
      protocol: 'OPP2',
      online: true,
      software: 'BP',
      sw_version: '3',
    });
    pub(T('connection'), { ...H(1), online: true, device: 'OpenPiste-ESP32', fw_version: '1.0.0' });
    expect(driver.findPiste('3')).toMatchObject({ status: 'online', device: 'OpenPiste-ESP32' });
    // Dernière volonté publiée par le broker
    pub(T('connection'), { online: false });
    expect(links.map(l => l.status)).toEqual(['online', 'offline']);
    driver.stop();
    expect(JSON.parse(broker.getRetained(T('connection', 'software'))!.toString()).online).toBe(
      false
    );
  });

  it('état, score, chrono, lampes, cartons P, médical → état complet', () => {
    driver.start();
    pub(T('state'), { ...H(1), state: 'F' });
    pub(T('score'), {
      ...H(2),
      right: { score: 3, status: 'U', yellow_card: true, red_cards: 1, black_card: false },
      left: { score: 2, status: 'U', yellow_card: false, red_cards: 0, black_card: true },
      priority: 'L',
    });
    pub(T('clock'), {
      protocol: 'OPP2',
      version: '1.0',
      ts: 1,
      running: true,
      time_ms: 89250,
      time: '1:29.25',
    });
    pub(T('lights'), {
      ...H(3),
      right: { green: true, white: false },
      left: { red: false, white: true },
    });
    pub(T('uw2f'), { ...H(4), time_ms: 0, right: { p_card: 2 }, left: { p_card: 0 } });
    pub(T('medical'), {
      ...H(5),
      active: true,
      side: 'left',
      duration_ms: 300000,
      remaining_ms: 1,
    });
    pub(T('medical'), {
      ...H(6),
      active: true,
      side: 'left',
      duration_ms: 300000,
      remaining_ms: 0,
    });
    expect(lastState()).toEqual({
      state: 'fencing',
      stopwatch: 89.25,
      priority: 'left',
      right: {
        score: 3,
        status: 'normal',
        yellowCards: 1,
        redCards: 1,
        light: true,
        whiteLight: false,
        pRed: 1,
      },
      left: {
        score: 2,
        status: 'exclusion',
        yellowCards: 0,
        redCards: 0,
        light: false,
        whiteLight: true,
        medical: 1,
      },
    });
    expect(inputs.map(i => i.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(inputs[0].source).toEqual({ driver: 'opp2', piste: '3' });
  });

  it('doublon QoS 1 écarté ; redémarrage (seq plus petit, ts plus récent) accepté', () => {
    driver.start();
    pub(T('state'), { ...H(10, 1000), state: 'F' });
    pub(T('state'), { ...H(10, 1000), state: 'F' });
    pub(T('state'), { ...H(9, 1000), state: 'H' });
    expect(inputs).toHaveLength(1);
    pub(T('state'), { ...H(1, 9000), state: 'W' });
    expect(lastState().state).toBe('waiting');
  });

  it('END + état E : une seule fin proposée ; NEXT / PREV ; piste inconnue relevée', () => {
    driver.start();
    pub(T('control'), { ...H(1), command: 'END' }, false);
    pub(T('state'), { ...H(2), state: 'E' });
    expect(inputs.filter(i => i.kind === 'state' && i.state.state === 'ending')).toHaveLength(1);
    pub(T('control'), { ...H(3), command: 'NEXT' }, false);
    pub(T('control'), { ...H(4), command: 'PREV' }, false);
    // Télécommande : BEGIN pour l'appareil, ignoré ; NEXT réservé à l'appareil
    pub(T('control', 'remote'), { ...H(1), command: 'NEXT' }, false);
    expect(inputs.slice(-2).map(i => i.kind)).toEqual(['next', 'prev']);
    pub(T('state', 'apparatus', '9'), { ...H(1), state: 'W' });
    expect(driver.getUnknownPistes()).toEqual(['9']);
  });

  it('affichage : software/fencers, match, score, clock ; Id attendus dans l’état ; ACK / NAK', () => {
    const out = softwareMessages();
    driver.start();
    expect(
      driver.send('3', {
        kind: 'display',
        display: { ...DISPLAY, stopwatch: 61 },
        competition: 'c1',
      })
    ).toBe(true);
    expect(out.fencers).toMatchObject({
      left: {
        fencer: { id: 'uuid-left-5678', name: 'PANINI Bruno', nation: '', club_abbr: 'Roma CS' },
      },
      right: { fencer: { id: 'uuid-right-1234', name: 'MARTIN Paul', nation: 'FRA' } },
      common: { referee: { id: 'r1', name: 'J. Smith' } },
    });
    expect(out.match).toMatchObject({
      weapon: 'E',
      type: 'I',
      competition: 'c1',
      phase_type: 'pool',
      phase: '1',
      poule: '2',
      match: 5,
      round: 1,
    });
    expect(out.score).toMatchObject({
      right: { score: 1, status: 'U' },
      left: { score: 0 },
      priority: 'N',
    });
    expect(out.clock).toMatchObject({ running: false, time_ms: 61000, time: '1:01' });
    pub(T('score'), { ...H(1), right: { score: 1 }, left: { score: 0 }, priority: 'N' });
    expect(lastState().right?.id).toBe('uuid-right-1234');
    driver.send('3', { kind: 'ack' });
    expect(out.control).toMatchObject({ command: 'ACK' });
    driver.send('3', { kind: 'nak' });
    expect(out.control).toMatchObject({ command: 'NAK' });
    expect(driver.send('4', { kind: 'ack' })).toBe(false);
  });

  it('inversion gaucher par l’arbitre : apparatus/fencers échange les Id', () => {
    driver.start();
    driver.send('3', { kind: 'display', display: DISPLAY });
    pub(T('fencers'), {
      ...H(1),
      left: { fencer: { id: 'uuid-right-1234', name: 'MARTIN Paul', nation: 'FRA' } },
      right: { fencer: { id: 'uuid-left-5678', name: 'PANINI Bruno', nation: '' } },
    });
    expect(lastState()).toMatchObject({
      left: { id: 'uuid-right-1234' },
      right: { id: 'uuid-left-5678' },
    });
  });

  it('reprise après coupure : états retenus relus au démarrage', () => {
    pub(T('connection'), { ...H(1), online: true });
    pub(T('state'), { ...H(2), state: 'H' });
    pub(T('score'), { ...H(3), right: { score: 4 }, left: { score: 2 }, priority: 'N' });
    driver.start();
    expect(driver.findPiste('3')?.status).toBe('online');
    expect(lastState()).toMatchObject({ state: 'halt', right: { score: 4 }, left: { score: 2 } });
  });
});

describe('plusieurs protocoles (#1960)', () => {
  it('chaque piste routée vers son pilote ; Id tronqué selon le protocole de la piste', () => {
    const broker = new MqttBroker();
    const opp2 = new Opp2PisteDriver(broker);
    opp2.setPistes([{ piste: '3', arena: 3 }]);
    opp2.start();
    const sent: string[] = [];
    const cyranoLike = Object.assign(new Opp2PisteDriver(new MqttBroker()), {
      id: 'cyrano',
      fencerId: (id: string) => id.slice(0, 8),
      send: (piste: string) => (sent.push(piste), true),
    });
    cyranoLike.setPistes([{ piste: '1', arena: 1 }]);
    const multi = new MultiPisteDriver([cyranoLike, opp2]);
    expect(multi.getStatuses().map(s => s.piste)).toEqual(['1', '3']);
    expect(multi.fencerId('0123456789', '1')).toBe('01234567');
    expect(multi.fencerId('0123456789', '3')).toBe('0123456789');
    multi.send('1', { kind: 'ack' });
    expect(sent).toEqual(['1']);
    const got: PisteInput[] = [];
    multi.on('input', i => got.push(i));
    broker.publish('openpiste/3/apparatus/state', JSON.stringify({ ...H(1), state: 'F' }), {
      qos: 1,
    });
    expect(got[0]).toMatchObject({ source: { driver: 'opp2', piste: '3' }, kind: 'state' });
    expect(multi.findAllByArena(3).map(s => s.piste)).toEqual(['3']);
  });
});
