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
    };
    left: { score: number; y: number; r: number; status: string; reserve: string; medical: number };
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
});
