/**
 * Module arbitre /js/refereeScoring.js (#1401) : zones, validation des touches, mort subite challenger.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const S = req('./refereeScoring.js');

const okState = {
  hasMatch: true,
  matchStatus: 'in_progress',
  isSuddenDeath: false,
  overtimeType: null,
  points: 1,
  zone: 'A',
  trainingCustomRules: null,
};

describe('refereeScoring.js zones', () => {
  it('activeCustomZones : standard, pool/tableau, zones tronquées à 3', () => {
    expect(S.activeCustomZones(null, false)).toBeNull();
    expect(S.activeCustomZones({ pool: null }, false)).toBeNull();
    expect(S.activeCustomZones({ pool: { type: 'simple' } }, false)).toEqual([
      { label: '', points: 1 },
    ]);
    const zones = [1, 2, 3, 4].map(p => ({ label: 'z' + p, points: p, extra: 1 }));
    expect(S.activeCustomZones({ pool: { type: 'zones', zones } }, false)).toEqual([
      { label: 'z1', points: 1 },
      { label: 'z2', points: 2 },
      { label: 'z3', points: 3 },
    ]);
    expect(S.activeCustomZones({ pool: null, de: { type: 'zones', zones: [] } }, true)).toEqual([
      { label: '', points: 1 },
    ]);
  });

  it('slotPoints et zoneLetter : standard puis personnalisé', () => {
    expect(S.slotPoints(null, 3)).toBe(3);
    expect(S.zoneLetter(null, 1)).toBe('A');
    expect(S.zoneLetter(null, 3)).toBe('B');
    expect(S.zoneLetter(null, 5)).toBe('C');
    const z = [
      { label: '', points: 2 },
      { label: '', points: 4 },
    ];
    expect(S.slotPoints(z, 1)).toBe(2);
    expect(S.slotPoints(z, 3)).toBe(4);
    expect(S.slotPoints(z, 5)).toBe(5);
    expect(S.zoneLetter(z, 4)).toBe('B');
    expect(S.zoneLetter(z, 9)).toBe('A');
  });
});

describe('refereeScoring.js validateAddScore', () => {
  it('cas simples', () => {
    expect(S.validateAddScore(okState)).toEqual({ ok: true });
    expect(S.validateAddScore({ ...okState, hasMatch: false })).toEqual({ ok: false });
    expect(S.validateAddScore({ ...okState, matchStatus: 'not_started' })).toEqual({
      ok: false,
      notify: 'referee.start_first',
    });
    expect(S.validateAddScore({ ...okState, matchStatus: 'finished' })).toEqual({ ok: false });
  });

  it('mort subite challenger : seulement +5', () => {
    const sd = { ...okState, isSuddenDeath: true, overtimeType: 'challenger' };
    expect(S.validateAddScore(sd).notify).toBe('referee.sd_zone_c_notif');
    expect(S.validateAddScore({ ...sd, points: 5, zone: 'C' }).ok).toBe(true);
    expect(S.validateAddScore({ ...sd, overtimeType: 'challenger_supplementary' }).notify).toBe(
      'referee.sd_zone_c_notif'
    );
    expect(S.validateAddScore({ ...sd, overtimeType: 'supplementary' }).ok).toBe(true);
  });

  it('entraînement : zones autorisées', () => {
    const t = { ...okState, trainingCustomRules: { allowedZones: ['B', 'C'] } };
    expect(S.validateAddScore(t)).toEqual({
      ok: false,
      notify: 'referee.zone_not_allowed',
      params: { zone: 'A', allowed: 'B, C' },
    });
    expect(S.validateAddScore({ ...t, zone: 'B' }).ok).toBe(true);
    expect(S.validateAddScore({ ...okState, trainingCustomRules: { allowedZones: [] } }).ok).toBe(
      true
    );
  });

  it('vibrationMs', () => {
    expect([1, 3, 5].map(S.vibrationMs)).toEqual([40, 80, 120]);
  });
});

describe('refereeScoring.js mort subite challenger', () => {
  const base = {
    isLaserSabre: true,
    isSuddenDeath: false,
    overtimeType: null,
    scoreA: 10,
    scoreB: 10,
    trainingCustomRules: null,
  };

  it('shouldTriggerChallenger', () => {
    expect(S.shouldTriggerChallenger(base)).toBe(true);
    expect(S.shouldTriggerChallenger({ ...base, scoreB: 9 })).toBe(false);
    expect(S.shouldTriggerChallenger({ ...base, isLaserSabre: false })).toBe(false);
    expect(
      S.shouldTriggerChallenger({ ...base, trainingCustomRules: { disableSuddenDeath: true } })
    ).toBe(false);
    expect(S.shouldTriggerChallenger({ ...base, isSuddenDeath: true, overtimeType: 'x' })).toBe(
      false
    );
    expect(
      S.shouldTriggerChallenger({ ...base, isSuddenDeath: true, overtimeType: 'supplementary' })
    ).toBe(true);
  });

  it('challengerExit : sous 10 -> retour supplémentaire ou fin de mort subite', () => {
    const sd = { ...base, isSuddenDeath: true, scoreB: 9 };
    expect(S.challengerExit({ ...sd, overtimeType: 'challenger' })).toEqual({
      overtimeType: null,
      isSuddenDeath: false,
    });
    expect(S.challengerExit({ ...sd, overtimeType: 'challenger_supplementary' })).toEqual({
      overtimeType: 'supplementary',
      isSuddenDeath: true,
    });
    expect(S.challengerExit({ ...sd, overtimeType: 'challenger', scoreB: 10 })).toBeNull();
    expect(S.challengerExit({ ...sd, overtimeType: 'supplementary' })).toBeNull();
    expect(S.challengerExit({ ...sd, overtimeType: 'challenger', isLaserSabre: false })).toBeNull();
  });

  it('referee.html charge le module et délègue', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'referee.html'), 'utf8');
    expect(html).toContain('<script src="/js/refereeScoring.js"></script>');
    expect(html).toContain('BPRefereeScoring.validateAddScore(');
    expect(html).not.toContain("['A', 'B', 'C'][idx < 0 ? 0 : idx]");
  });
});
