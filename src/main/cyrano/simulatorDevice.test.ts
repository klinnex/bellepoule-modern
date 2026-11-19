import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseCyrano } from './codec';
// Appareil simulé (scripts/lib/cyranoDevice.js), testé ici car Vitest ne couvre que src/
const { CyranoDevice, COMMANDS } = require('../../../scripts/lib/cyranoDevice.js');

const RIGHT = '3f0c9a7e-1b2d-4c5e-8f90-a1b2c3d4e5f6';
const LEFT = '9b8a7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const DISP =
  `|EFP1.1|DISP|1|C1|2|A2|1||||I|F|N|||||%|${RIGHT.slice(0, 8)}|DUVAL J|FRA|0|%|` +
  `${LEFT.slice(0, 8)}|FAURE M|FRA|0|%|`;

type Device = {
  command(c: string): boolean;
  receive(raw: string): void;
  snapshot(): {
    state: string;
    stopwatch: string;
    period: string;
    priority: string;
    general: { round: string; weapon: string };
    right: {
      score: number;
      y: number;
      r: number;
      status: string;
      reserve: string;
      medical: number;
      p: number;
    };
    left: {
      score: number;
      y: number;
      r: number;
      status: string;
      reserve: string;
      medical: number;
      p: number;
    };
    blocked: Record<string, string>;
  };
  stop(): void;
  on(ev: string, fn: (e: { dir: string; text: string }) => void): void;
};

describe('Appareil Cyrano simulé — télécommande WSG (SG31 / SG32)', () => {
  let d: Device;
  let sent: string[];
  let notes: string[];
  const tick = (n: number) => vi.advanceTimersByTime(n * 1000);
  const lastInfo = () => {
    const infos = sent.filter(r => r.includes('|INFO|'));
    return parseCyrano(infos[infos.length - 1] ?? '');
  };

  beforeEach(() => {
    vi.useFakeTimers();
    d = new CyranoDevice({ piste: '1' });
    sent = [];
    notes = [];
    d.on('log', e =>
      e.dir === 'out' ? sent.push(e.text) : e.dir === 'note' && notes.push(e.text)
    );
    d.receive(DISP);
    d.command('begin');
  });
  afterEach(() => {
    d.stop();
    vi.useRealTimers();
  });

  it('expose toutes les commandes de la télécommande', () => {
    for (const c of [
      'pause',
      'reset',
      'round+',
      'clock+',
      'init+',
      'prio',
      'zero',
      'cards0',
      'er',
      'resl',
      'ml',
      'raz',
    ])
      expect(COMMANDS).toContain(c);
  });

  it('temps écoulé : GO refusé, PAUSE puis reprise en période 2 sans perdre score ni cartons', () => {
    d.command('yr');
    d.command('rl');
    d.command('r+');
    d.command('go');
    tick(180);
    expect(d.snapshot()).toMatchObject({ state: 'H', stopwatch: '0:00.00' });
    expect(d.snapshot().blocked.go).toMatch(/temps écoulé/);
    d.command('go');
    expect(d.snapshot().state).toBe('H');

    d.command('pause');
    expect(d.snapshot()).toMatchObject({ state: 'P', stopwatch: '1:00' });
    expect(lastInfo()?.state).toBe('P');
    expect(d.snapshot().blocked.go).toMatch(/repos/);
    tick(60);
    const s = d.snapshot();
    expect(s).toMatchObject({ state: 'H', stopwatch: '3:00', general: { round: '2' } });
    expect(s.right).toMatchObject({ score: 1, y: 1 });
    expect(s.left.r).toBe(1);
    expect(notes[notes.length - 1]).toMatch(/période 2/);
    d.command('stopgo');
    expect(d.snapshot().state).toBe('F');
  });

  it('RESET remet le temps de la période sans effacer tireurs, score ni cartons', () => {
    d.command('l+');
    d.command('yl');
    d.command('go');
    tick(42);
    d.command('reset');
    const s = d.snapshot();
    expect(s).toMatchObject({ state: 'H', stopwatch: '3:00' });
    expect(s.left).toMatchObject({ score: 1, y: 1 });
    expect(lastInfo()?.left?.id).toBe(LEFT.slice(0, 8));
  });

  it('RESET pendant la minute de repos l’écourte (période inchangée)', () => {
    d.command('pause');
    tick(10);
    d.command('reset');
    expect(d.snapshot()).toMatchObject({ state: 'H', stopwatch: '3:00', general: { round: '1' } });
  });

  it('CLOCK ±1 s arrête le chrono ; RESET ±1 min change la durée de la période', () => {
    d.command('go');
    tick(5);
    d.command('clock+');
    expect(d.snapshot()).toMatchObject({ state: 'H', stopwatch: '2:56' });
    d.command('init-');
    expect(d.snapshot()).toMatchObject({ stopwatch: '2:00', period: '2:00' });
    d.command('round+');
    d.command('round-');
    d.command('round-');
    expect(d.snapshot().general.round).toBe('1');
  });

  it('0:0 et CARDS RESET ; ∨ jaune / ∨ rouge retirent les cartons', () => {
    d.command('r+');
    d.command('yr');
    d.command('rr');
    d.command('rr');
    d.command('rr-');
    expect(d.snapshot().right).toMatchObject({ y: 1, r: 1 });
    d.command('yr-');
    expect(d.snapshot().right.y).toBe(0);
    d.command('zero');
    expect(d.snapshot().right).toMatchObject({ score: 0, r: 1 });
    d.command('cards0');
    expect(d.snapshot().right.r).toBe(0);
  });

  it('cartons P par côté (champ 12 EFP1.1) : montée 0 à 5, descente, INFO, CARDS RESET (#2001)', () => {
    for (const c of ['pcr+', 'pcr-', 'pcl+', 'pcl-']) expect(COMMANDS).toContain(c);
    d.command('pcr+');
    expect(lastInfo()?.right).toMatchObject({ pCard: 1 });
    d.command('pcr+');
    d.command('pcr+');
    expect(lastInfo()?.right).toMatchObject({ pCard: 3 });
    for (let i = 0; i < 6; i++) d.command('pcr+');
    expect(d.snapshot().right.p).toBe(5);
    d.command('pcr-');
    expect(lastInfo()?.right).toMatchObject({ pCard: 4 });
    // Côté gauche indépendant, jamais en dessous de 0
    d.command('pcl-');
    expect(d.snapshot().left.p).toBe(0);
    d.command('pcl+');
    d.command('pcl+');
    expect(lastInfo()?.left).toMatchObject({ pCard: 2 });
    expect(d.snapshot().right.p).toBe(4);
    d.command('cards0');
    expect(d.snapshot().right.p).toBe(0);
    expect(d.snapshot().left.p).toBe(0);
  });

  it('carton P absent des trames en EFP1 (champ 12 propre à EFP1.1)', () => {
    d.receive('|EFP1|HELLO|1|C1|%|');
    d.command('pcr+');
    const info = sent.filter(r => r.includes('|INFO|')).pop() ?? '';
    expect(info.startsWith('|EFP1|')).toBe(true);
    expect(parseCyrano(info)?.right?.pCard).toBeUndefined();
  });

  it('DISP d’un match repris (PREV) : carton P installé, puis corrigé par un DISP en cours de match', () => {
    d.command('raz');
    d.receive(
      `|EFP1.1|DISP|1|C1|2|A2|1||||I|F|N|||||%|${RIGHT.slice(0, 8)}|DUVAL J|FRA|5|U|0|0|0|0|0|N|4|%|` +
        `${LEFT.slice(0, 8)}|FAURE M|FRA|2|U|0|0|0|0|0|N|2|%|`
    );
    expect(d.snapshot().right.p).toBe(4);
    expect(d.snapshot().left.p).toBe(2);
    d.command('begin');
    d.receive(
      `|EFP1.1|DISP|1|C1|2|A2|1||||I|F|N|||||%|${RIGHT.slice(0, 8)}|DUVAL J|FRA|5|U|0|0|0|0|0|N|0|%|` +
        `${LEFT.slice(0, 8)}|FAURE M|FRA|2|U|0|0|0|0|0|N|2|%|`
    );
    expect(d.snapshot().right.p).toBe(0);
    expect(d.snapshot().left.p).toBe(2);
  });

  it('bloc PC : abandon, expulsion, réserve, médical dans la trame INFO', () => {
    d.command('al');
    d.command('er');
    d.command('resl');
    d.command('mr');
    const info = lastInfo();
    expect(info?.left).toMatchObject({ status: 'A', reserve: true });
    expect(info?.right).toMatchObject({ status: 'E', medical: 1 });
    d.command('al');
    expect(d.snapshot().left.status).toBe('U');
  });

  it('priorité tirée au sort, P RESET, arme', () => {
    d.command('prio');
    expect(['R', 'L']).toContain(d.snapshot().priority);
    d.command('pn');
    expect(d.snapshot().priority).toBe('N');
    d.command('sabre');
    expect(d.snapshot().general.weapon).toBe('S');
    d.command('weapon');
    expect(d.snapshot().general.weapon).toBe('E');
  });

  it('VALIDATE → E ; NEXT bloqué tant que le match n’est pas acquitté ; RAZ efface tout', () => {
    d.command('validate');
    expect(d.snapshot().state).toBe('E');
    expect(d.snapshot().blocked.next).toMatch(/VALIDATE/);
    d.receive('|EFP1.1|ACK|1|C1|%|');
    expect(d.snapshot().state).toBe('W');
    expect(d.snapshot().blocked.next).toBe('');
    d.command('raz');
    expect(d.snapshot()).toMatchObject({ state: 'W', right: { score: 0 } });
    expect(d.snapshot().blocked.begin).toMatch(/aucun match/);
  });
  it('NAK : fin refusée, l’appareil revient en halte ; correction puis VALIDATE acceptés (spéc. § 4)', () => {
    d.command('validate');
    expect(d.snapshot().state).toBe('E');
    sent.length = 0;
    d.receive('|EFP1.1|NAK|1|C1|%|');
    expect(d.snapshot().state).toBe('H');
    expect(parseCyrano(sent[sent.length - 1])?.state).toBe('H');
    expect(d.command('r+')).toBe(true);
    d.command('validate');
    expect(d.snapshot().state).toBe('E');
    d.receive('|EFP1.1|ACK|1|C1|%|');
    expect(d.snapshot().state).toBe('W');
  });
  it('DISP d’un match repris (PREV) : scores et cartons installés', () => {
    d.command('raz');
    d.receive(
      `|EFP1.1|DISP|1|C1|2|A2|1|||1:20|I|F|N|||||%|${RIGHT.slice(0, 8)}|DUVAL J|FRA|5|U|1|0|%|` +
        `${LEFT.slice(0, 8)}|FAURE M|FRA|2|U|0|2|%|`
    );
    expect(d.snapshot().right).toMatchObject({ score: 5, y: 1, r: 0 });
    expect(d.snapshot().left).toMatchObject({ score: 2, y: 0, r: 2 });
    expect(d.snapshot().stopwatch).toBe('1:20');
    // Statut d'un tireur sorti (abandon, exclusion) repris du DISP
    d.command('raz');
    d.receive(
      `|EFP1.1|DISP|1|C1|2|A2|1||||I|F|N|||||%|${RIGHT.slice(0, 8)}|DUVAL J|FRA|5|U|%|` +
        `${LEFT.slice(0, 8)}|FAURE M|FRA|2|E|%|`
    );
    expect(d.snapshot().left.status).toBe('E');
    expect(d.snapshot().right.status).toBe('U');
  });
});

describe('Appareil Cyrano simulé — équipes (Type=T, #1829)', () => {
  const teamDisp = (relay: number, right: string, left: string, a: number, b: number) =>
    `|EFP1.1|DISP|1|C1||||${relay}|||T|S|N|||||%|${right}|DUVAL J|FRA|${a}|%|` +
    `${left}|FAURE M|ITA|${b}|%|`;
  type TeamDevice = Omit<Device, 'snapshot'> & {
    snapshot(): ReturnType<Device['snapshot']> & { team: boolean; relay: number | null };
  };
  let d: TeamDevice;
  let sent: string[];
  let notes: string[];
  const lastInfo = () => {
    const infos = sent.filter(r => r.includes('|INFO|'));
    return parseCyrano(infos[infos.length - 1] ?? '');
  };

  beforeEach(() => {
    vi.useFakeTimers();
    d = new CyranoDevice({ piste: '1' });
    sent = [];
    notes = [];
    d.on('log', e =>
      e.dir === 'out' ? sent.push(e.text) : e.dir === 'note' && notes.push(e.text)
    );
    d.receive(teamDisp(1, 'r1', 'l1', 0, 0));
  });
  afterEach(() => {
    d.stop();
    vi.useRealTimers();
  });

  it('DISP Type=T : relais 1 installé, type T et Round renvoyés dans l’INFO', () => {
    expect(d.snapshot()).toMatchObject({ team: true, relay: 1, state: 'W' });
    expect(notes[notes.length - 1]).toMatch(/relais 1/);
    d.command('begin');
    expect(lastInfo()).toMatchObject({ type: 'T', round: '1', state: 'H' });
  });

  it('ROUND ∧∨ bloqués en équipes : le relais est fixé par le logiciel', () => {
    d.command('begin');
    expect(d.snapshot().blocked['round+']).toMatch(/relais/);
    d.command('round+');
    expect(d.snapshot().relay).toBe(1);
  });

  it('fin de relais : ACK → W, DISP du relais suivant avec les cumuls, BEGIN sans remise à zéro', () => {
    d.command('begin');
    for (let i = 0; i < 5; i++) d.command('r+');
    d.command('l+');
    d.command('validate');
    expect(lastInfo()).toMatchObject({ state: 'E', right: { score: 5 }, left: { score: 1 } });
    d.receive('|EFP1.1|ACK|1|C1|%|');
    expect(d.snapshot().state).toBe('W');
    expect(notes.some(n => /relais 1 acquittée/.test(n))).toBe(true);
    d.receive(teamDisp(2, 'r2', 'l2', 5, 1));
    d.command('begin');
    expect(d.snapshot()).toMatchObject({
      relay: 2,
      right: { id: 'r2', score: 5 },
      left: { id: 'l2', score: 1 },
    });
    d.command('l+');
    expect(lastInfo()).toMatchObject({ round: '2', right: { score: 5 }, left: { score: 2 } });
  });

  it('RESERVE : champ 11 = R dans la zone du tireur, effacé au relais suivant', () => {
    d.command('begin');
    d.command('resr');
    expect(lastInfo()?.right).toMatchObject({ id: 'r1', reserve: true });
    expect(lastInfo()?.left?.reserve).toBe(false);
    d.command('validate');
    d.receive('|EFP1.1|ACK|1|C1|%|');
    d.receive(teamDisp(2, 'r2', 'l2', 0, 0));
    expect(d.snapshot().right.reserve).toBe('N');
  });
});
