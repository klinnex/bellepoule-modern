/**
 * Rejeu d'un journal de trames exporté (scripts/lib/cyranoReplay.js, #2001) : analyse du format
 * produit par `formatCyranoLog`, sélection des trames IN d'une piste, calendrier au rythme d'origine.
 */
import { describe, it, expect } from 'vitest';
import { formatCyranoLog } from '../../renderer/components/remote/cyranoSettings';
import type { CyranoFrameLogDTO } from '../../shared/types/preload';
// Script Node partagé avec le simulateur, testé ici car Vitest ne couvre que src/
const {
  parseCyranoLog,
  replayPistes,
  selectReplayFrames,
  replaySchedule,
} = require('../../../scripts/lib/cyranoReplay.js');

const T0 = Date.parse('2026-11-19T10:00:00.000Z');
const HELLO_ACK =
  '|EFP1.1|INFO|1|C1|||||3:00||||N|W|%||||0|U|0|0|0|0|0|N|0|%||||0|U|0|0|0|0|0|N|0|%|';
const info = (s: string) => `|EFP1.1|INFO|1|C1|||||${s}||||N|F|%|`;

const log: CyranoFrameLogDTO[] = [
  { ts: T0, dir: 'in', ip: '10.0.0.5', port: 50101, piste: '1', raw: HELLO_ACK },
  { ts: T0 + 500, dir: 'out', ip: '10.0.0.5', port: 50101, piste: '1', raw: '|EFP1.1|DISP|1|%|' },
  { ts: T0 + 2000, dir: 'in', ip: '10.0.0.5', port: 50101, piste: '1', raw: info('2:58') },
  { ts: T0 + 2500, dir: 'in', ip: '10.0.0.9', port: 50101, piste: '2', raw: info('1:00') },
  {
    ts: T0 + 3000,
    dir: 'in',
    ip: '10.0.0.7',
    port: 50101,
    piste: null,
    raw: '|EFP1.1|INFO|x|%|',
    rejected: 'unknown_ip',
  },
  {
    ts: T0 + 4000,
    dir: 'in',
    ip: '10.0.0.5',
    port: 50101,
    piste: '1',
    raw: 'xx',
    rejected: 'malformed',
  },
];

describe('parseCyranoLog (format de formatCyranoLog)', () => {
  const { entries, skipped } = parseCyranoLog(formatCyranoLog(log) + '\n');

  it('relit les six trames avec sens, adresse, piste et rejet', () => {
    expect(skipped).toBe(0);
    expect(entries).toHaveLength(6);
    expect(entries[0]).toMatchObject({
      ts: T0,
      dir: 'in',
      addr: '10.0.0.5:50101',
      piste: '1',
      raw: HELLO_ACK,
      rejected: null,
    });
    expect(entries[1].dir).toBe('out');
    expect(entries[4]).toMatchObject({ piste: null, rejected: 'unknown_ip' });
  });

  it('ignore et compte les lignes vides ou illisibles', () => {
    const r = parseCyranoLog(`\n${formatCyranoLog(log.slice(0, 1))}\nn'importe quoi\n2026\tIN\n`);
    expect(r.entries).toHaveLength(1);
    expect(r.skipped).toBe(2);
  });
});

describe('sélection et calendrier', () => {
  const { entries } = parseCyranoLog(formatCyranoLog(log));

  it('liste les pistes des trames IN', () => {
    expect(replayPistes(entries)).toEqual(['1', '2']);
  });

  it('ne garde que les trames IN valides de la piste demandée', () => {
    const frames = selectReplayFrames(entries, '1');
    expect(frames.map((f: { raw: string }) => f.raw)).toEqual([HELLO_ACK, info('2:58')]);
  });

  it('sans piste : toutes les trames IN sauf les illisibles (OUT écartées)', () => {
    expect(selectReplayFrames(entries, null)).toHaveLength(4);
  });

  it('respecte le rythme d’origine, divisé par --speed', () => {
    const frames = selectReplayFrames(entries, '1');
    expect(replaySchedule(frames, 1).map((s: { delayMs: number }) => s.delayMs)).toEqual([0, 2000]);
    expect(replaySchedule(frames, 4).map((s: { delayMs: number }) => s.delayMs)).toEqual([0, 500]);
  });

  it('refuse une vitesse nulle, négative ou non numérique', () => {
    for (const v of [0, -1, Number.NaN]) expect(() => replaySchedule([], v)).toThrow();
  });
});
