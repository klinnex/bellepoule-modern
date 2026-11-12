import { describe, it, expect } from 'vitest';
import { buildCyrano, parseCyrano, sanitizeField } from './codec';
import { formatCyranoName, formatCyranoNat, transliterate } from './names';
import { cyranoResult, validateCyranoEnd } from './endValidation';
import { buildDisp, toCyranoWeapon } from './disp';

// Trames d'exemple de la spécification Cyrano 1.1 (§6)
const SPEC = {
  hello: '|EFP1.1|HELLO|17|fm-eq|%|',
  next: '|EFP1.1|NEXT|17|fm-eq|%|',
  prev: '|EFP1.1|PREV|17|fm-eq|%|',
  infoNoDisp: '|EFP1.1|INFO||||||||3:00||||W|%||||0|U|0|1|1|0|0|N|%||||0|U|0|1|0|0|0|N|%|',
  infoEmptyDisp:
    '|EFP1.1|INFO|17|efj-eq||||||3:00||||W|%||||8|V|0|1|1|0|0|N|%||||6|D|0|1|0|0|0|N|%|',
  infoFull:
    '|EFP1.1|INFO|17|efj-eq|1|A32|12|2|10:30|3:00|I|S||W|132|J.Smith|GBR|%|28|P.Martin|FRA|8|V|0|1|1|0|0|N|%|32|B. Panini|ITA|6|D|0|1|0|0|0|N|%|',
  infoWaitingNoMatch: '|EFP1.1|INFO||||||||||||W||%|',
  dispSnippet: '|EFP1.1|DISP|8|fm-eq|2|B64|%|28|P. Martin|FRA||U|%|32| B. Panini|ITA||U|%|',
};

describe('parseCyrano — trames de la spécification', () => {
  it('HELLO / NEXT / PREV', () => {
    expect(parseCyrano(SPEC.hello)).toEqual({
      protocol: 'EFP1.1',
      command: 'HELLO',
      piste: '17',
      compe: 'fm-eq',
    });
    expect(parseCyrano(SPEC.next)?.command).toBe('NEXT');
    expect(parseCyrano(SPEC.prev)?.command).toBe('PREV');
  });

  it('INFO incomplet sans DISP : chrono, état et données appareil', () => {
    const m = parseCyrano(SPEC.infoNoDisp)!;
    expect(m.piste).toBe('');
    expect(m.stopwatch).toBe('3:00');
    expect(m.state).toBe('W');
    expect(m.right).toEqual({
      score: 0,
      status: 'U',
      yellowCards: 0,
      redCards: 1,
      light: true,
      whiteLight: false,
      medical: 0,
      reserve: false,
    });
    expect(m.left?.light).toBe(false);
  });

  it('INFO après DISP vide', () => {
    const m = parseCyrano(SPEC.infoEmptyDisp)!;
    expect(m.piste).toBe('17');
    expect(m.compe).toBe('efj-eq');
    expect(m.right?.score).toBe(8);
    expect(m.right?.status).toBe('V');
    expect(m.left?.score).toBe(6);
    expect(m.left?.id).toBeUndefined();
  });

  it('INFO complet', () => {
    const m = parseCyrano(SPEC.infoFull)!;
    expect(m).toMatchObject({
      phase: '1',
      poulTab: 'A32',
      match: '12',
      round: '2',
      time: '10:30',
      stopwatch: '3:00',
      type: 'I',
      weapon: 'S',
      state: 'W',
      refId: '132',
      refName: 'J.Smith',
      refNat: 'GBR',
    });
    expect(m.priority).toBeUndefined();
    expect(m.right).toMatchObject({ id: '28', name: 'P.Martin', nat: 'FRA', score: 8 });
    expect(m.left).toMatchObject({ id: '32', name: 'B. Panini', nat: 'ITA', score: 6 });
  });

  it('INFO en attente sans match', () => {
    const m = parseCyrano(SPEC.infoWaitingNoMatch)!;
    expect(m.state).toBe('W');
    expect(m.right).toBeUndefined();
  });

  it('DISP abrégé, espaces parasites retirés', () => {
    const m = parseCyrano(SPEC.dispSnippet)!;
    expect(m.poulTab).toBe('B64');
    expect(m.left?.name).toBe('B. Panini');
    expect(m.right?.score).toBeUndefined();
  });

  it('EFP1 et carton P (EFP1.1)', () => {
    expect(parseCyrano('|EFP1|HELLO|3|x|%|')?.protocol).toBe('EFP1');
    const m = parseCyrano('|EFP1.1|INFO|3|x||||||||||F|%|1||||||||||N|4|%|')!;
    expect(m.right?.pCard).toBe(4);
  });

  it('rejette les trames invalides', () => {
    expect(parseCyrano('')).toBeNull();
    expect(parseCyrano('EFP1.1|HELLO|1|x|%|')).toBeNull();
    expect(parseCyrano('|EFP2|HELLO|1|x|%|')).toBeNull();
    expect(parseCyrano('|EFP1.1|BOOM|1|x|%|')).toBeNull();
    expect(parseCyrano('|EFP1.1|INFO|' + 'x'.repeat(600))).toBeNull();
  });

  it('valeurs hors domaine ignorées', () => {
    const m = parseCyrano('|EFP1.1|INFO|1|x||||||||Z|Q|W|%|1||||X|a|%|')!;
    expect(m.weapon).toBeUndefined();
    expect(m.priority).toBeUndefined();
    expect(m.state).toBe('W');
    expect(m.right).toEqual({ id: '1' });
  });
});

describe('buildCyrano', () => {
  it('HELLO conforme à la spécification', () => {
    expect(buildCyrano({ protocol: 'EFP1.1', command: 'HELLO', piste: '17', compe: 'fm-eq' })).toBe(
      SPEC.hello
    );
  });

  it('champs obligatoires présents même vides', () => {
    expect(buildCyrano({ protocol: 'EFP1', command: 'ACK', piste: '1', compe: '' })).toBe(
      '|EFP1|ACK|1||%|'
    );
  });

  it('aller-retour sur une trame complète', () => {
    const m = parseCyrano(SPEC.infoFull)!;
    expect(parseCyrano(buildCyrano(m))).toEqual(m);
  });

  it('EFP1 omet le carton P, EFP1.1 le transmet', () => {
    const base = {
      command: 'DISP' as const,
      piste: '1',
      compe: 'c',
      right: { id: '1', score: 0, pCard: 2 },
    };
    expect(buildCyrano({ ...base, protocol: 'EFP1' })).toBe('|EFP1|DISP|1|c|%|1|||0|%|');
    expect(buildCyrano({ ...base, protocol: 'EFP1.1' })).toBe(
      '|EFP1.1|DISP|1|c|%|1|||0||||||||2|%|'
    );
  });

  it('nettoie | et % et tronque', () => {
    const raw = buildCyrano({
      protocol: 'EFP1.1',
      command: 'DISP',
      piste: 'piste-trop-longue',
      compe: 'a|b%c',
      right: { id: '1', name: 'DUPONT|%JEAN-CHRISTOPHE-DE-LA-TOUR' },
      left: { id: '2' },
    });
    const m = parseCyrano(raw)!;
    expect(m.piste).toBe('piste-tr');
    expect(m.compe).toBe('abc');
    expect(m.right?.name).toHaveLength(20);
    expect(m.left?.id).toBe('2');
  });

  it('zone droite vide mais gauche présente', () => {
    const raw = buildCyrano({
      protocol: 'EFP1.1',
      command: 'DISP',
      piste: '1',
      compe: 'c',
      left: { id: '9' },
    });
    expect(raw).toBe('|EFP1.1|DISP|1|c|%|%|9|%|');
    expect(parseCyrano(raw)?.left?.id).toBe('9');
  });

  it('sanitizeField', () => {
    expect(sanitizeField(undefined, 3)).toBe('');
    expect(sanitizeField(' a\tb|c ', 8)).toBe('abc');
    expect(sanitizeField(12345, 2)).toBe('12');
  });
});

describe('noms et nations', () => {
  it('translittération', () => {
    expect(transliterate('Élodie Bœuf-Øster')).toBe('Elodie Boeuf-Oster');
    expect(transliterate('Иван')).toBe('');
    expect(transliterate('Straße')).toBe('StraSSe');
  });

  it('convention olympique', () => {
    expect(formatCyranoName('Martin', 'Pierre')).toBe('MARTIN P');
    expect(formatCyranoName('Grumier-Leblanc', 'Élise', 10)).toBe('GRUMIER- E');
    expect(formatCyranoName('Grumier-Leblanc', 'Élise', 15)).toBe('GRUMIER-LEBLA E');
    expect(formatCyranoName('Grumier-Leblanc', 'Élise', 20)).toBe('GRUMIER-LEBLANC E');
    expect(formatCyranoName('', 'Solo')).toBe('Solo');
    expect(formatCyranoName('Seul', '')).toBe('SEUL');
  });

  it('nation sur 3 caractères', () => {
    expect(formatCyranoNat('fra')).toBe('FRA');
    expect(formatCyranoNat('Cercle d’Escrime')).toBe('CER');
    expect(formatCyranoNat(undefined)).toBe('');
  });
});

describe('fin de match (ACK / NAK)', () => {
  it('cas de la spécification', () => {
    const info = (prio: string, r: string, l: string) =>
      parseCyrano(`|EFP1.1|INFO|1|c|||||||I|E|${prio}|E|%|${r}|%|${l}|%|`)!;
    expect(validateCyranoEnd(info('N', '28|||5|U', '32|||3|U'))).toEqual({ ok: true });
    expect(validateCyranoEnd(info('N', '28|||4|U', '32|||4|U'))).toEqual({
      ok: false,
      reason: 'tie_without_priority',
    });
    expect(validateCyranoEnd(info('R', '28|||4|U', '32|||4|U'))).toEqual({ ok: true });
    expect(validateCyranoEnd(info('N', '28|||4|A', '32|||4|U'))).toEqual({ ok: true });
    expect(validateCyranoEnd(info('N', '28|||4|U', '32|||4|E'))).toEqual({ ok: true });
    expect(validateCyranoEnd(info('N', '|||4|U', '32|||3|U'))).toEqual({
      ok: false,
      reason: 'missing_fencers',
    });
    expect(validateCyranoEnd(info('N', '28||||U', '32|||3|U'))).toEqual({
      ok: false,
      reason: 'missing_scores',
    });
    expect(
      validateCyranoEnd(info('N', '28|||4|U', '32|||4|U'), { intermediateRound: true })
    ).toEqual({ ok: true });
    expect(validateCyranoEnd(parseCyrano(SPEC.infoFull)!)).toEqual({
      ok: false,
      reason: 'not_ending',
    });
  });

  it('résultat par identifiant : insensible à l’inversion droite/gauche', () => {
    const a = parseCyrano('|EFP1.1|INFO|1|c|||||||I|E|N|E|%|28|||5|U|%|32|||3|U|%|')!;
    const b = parseCyrano('|EFP1.1|INFO|1|c|||||||I|E|N|E|%|32|||3|U|%|28|||5|U|%|')!;
    expect(cyranoResult(a)).toEqual(cyranoResult(b));
    expect(cyranoResult(a)?.winnerId).toBe('28');
    const prio = parseCyrano('|EFP1.1|INFO|1|c|||||||I|E|L|E|%|28|||4|U|%|32|||4|U|%|')!;
    expect(cyranoResult(prio)?.winnerId).toBe('32');
    const ab = parseCyrano('|EFP1.1|INFO|1|c|||||||I|E|N|E|%|28|||5|A|%|32|||3|U|%|')!;
    expect(cyranoResult(ab)).toMatchObject({ winnerId: '32', abandoned: ['28'] });
  });
});

describe('DISP depuis un match', () => {
  it('construit les champs et respecte les longueurs', () => {
    const disp = buildDisp({
      phase: 2,
      poulTab: 'A32',
      match: 7,
      weapon: 'E',
      right: { id: 'f-1', lastName: 'Martin', firstName: 'Pierre', nat: 'FRA' },
      left: { id: 'f-2', lastName: 'Panini', firstName: 'Bruno', nat: 'ita', score: 3 },
    });
    const raw = buildCyrano({
      ...disp,
      protocol: 'EFP1.1',
      command: 'DISP',
      piste: '1',
      compe: 'c',
    });
    const m = parseCyrano(raw)!;
    expect(m).toMatchObject({ phase: '2', poulTab: 'A32', match: '7', round: '1', weapon: 'E' });
    expect(m.right).toMatchObject({ id: 'f-1', name: 'MARTIN P', nat: 'FRA', status: 'U' });
    expect(m.left).toMatchObject({ id: 'f-2', name: 'PANINI B', nat: 'ITA', score: 3 });
  });

  it('armes hors protocole', () => {
    expect(toCyranoWeapon('L')).toBeUndefined();
    expect(toCyranoWeapon('C')).toBeUndefined();
    expect(toCyranoWeapon('S')).toBe('S');
  });
});
