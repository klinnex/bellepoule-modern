/**
 * Tests unitaires - Export des tireurs (TXT / FFF)
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import {
  encodeFFFWin1252,
  exportFencersToFFF,
  exportFencersToTXT,
  exportResultsToFFF,
} from './fencerExport';
import { Category, Competition, Fencer, FencerStatus, Gender, Weapon } from '../types';

const makeFencer = (over: Partial<Fencer> = {}): Fencer => ({
  id: '1',
  ref: 1,
  lastName: 'Dupont',
  firstName: 'Jean',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('exportFencersToFFF', () => {
  it('commence par l’en-tête FFF standard', () => {
    const out = exportFencersToFFF([]);
    expect(out.split('\n')[0]).toBe('FFF;UTF8;competition;;individuel');
  });

  it('met le nom en majuscules et convertit le genre', () => {
    const out = exportFencersToFFF([makeFencer({ lastName: 'Martin', gender: Gender.FEMALE })]);
    const line = out.split('\n')[1];
    expect(line.startsWith('MARTIN,Jean,')).toBe(true);
    expect(line).toContain(',F,FRA');
  });

  it('formate la date de naissance en DD/MM/YYYY', () => {
    const out = exportFencersToFFF([makeFencer({ birthDate: new Date('1990-03-05') })]);
    expect(out.split('\n')[1]).toContain(',05/03/1990,');
  });

  it('incrémente la position pour chaque tireur', () => {
    const out = exportFencersToFFF([
      makeFencer({ id: '1' }),
      makeFencer({ id: '2', lastName: 'Martin' }),
    ]);
    const lines = out.split('\n');
    expect(lines[1].endsWith(';1,t')).toBe(true);
    expect(lines[2].endsWith(';2,t')).toBe(true);
  });

  it('laisse la date vide si absente', () => {
    const out = exportFencersToFFF([makeFencer({ birthDate: undefined })]);
    // section0 : NOM,Prénom,,Sexe,Nation
    expect(out.split('\n')[1]).toContain('DUPONT,Jean,,M,FRA');
  });
});

describe('exportFencersToTXT', () => {
  it('inclut le titre souligné quand fourni', () => {
    const out = exportFencersToTXT([makeFencer()], 'Liste');
    const lines = out.split('\n');
    expect(lines[0]).toBe('Liste');
    expect(lines[1]).toBe('=====');
  });

  it('indique le nombre de tireurs', () => {
    const out = exportFencersToTXT([makeFencer(), makeFencer({ id: '2' })]);
    expect(out).toContain('Nombre de tireurs : 2');
  });

  it('gère la liste vide', () => {
    const out = exportFencersToTXT([]);
    expect(out).toContain('Nombre de tireurs : 0');
    expect(out).toContain('Aucun tireur.');
  });

  it('affiche le nom en majuscules et l’année de naissance', () => {
    const out = exportFencersToTXT([
      makeFencer({ lastName: 'Bernard', birthDate: new Date('2001-07-09') }),
    ]);
    expect(out).toContain('BERNARD');
    expect(out).toContain('2001');
  });

  it('affiche le classement préfixé de # ou un tiret', () => {
    const withRank = exportFencersToTXT([makeFencer({ ranking: 12 })]);
    expect(withRank).toContain('#12');
    const withoutRank = exportFencersToTXT([makeFencer({ ranking: undefined })]);
    expect(withoutRank).toContain(' - ');
  });

  it('clôt la liste par une ligne de fin', () => {
    const out = exportFencersToTXT([makeFencer()]);
    expect(out).toContain('--- Fin de la liste (1 tireurs) ---');
  });
});

describe('exportFencersToFFF — département (#1504)', () => {
  it('écrit le département après le classement', () => {
    const out = exportFencersToFFF([makeFencer({ region: 'IDF', ranking: 3, department: '75' })]);
    expect(out.split('\n')[1]).toContain(';,IDF,,3,,75;');
  });
});

describe('exportResultsToFFF (spécification FFF)', () => {
  const comp = {
    id: 'c1',
    title: 'Coupe de Dourdan 2026',
    shortTitle: 'Dourdan 2026',
    organizer: "CERCLE D'ESCRIME DE DOURDAN",
    date: new Date('2026-06-07'),
    weapon: Weapon.SABRE,
    gender: Gender.MALE,
    category: Category.SENIOR,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Competition;

  it('écrit l’en-tête FFF;WIN;COMPETITION;organisateur puis la ligne de compétition', () => {
    const out = exportResultsToFFF(comp, []);
    const lines = out.split('\n');
    expect(lines[0]).toBe("FFF;WIN;COMPETITION;CERCLE D'ESCRIME DE DOURDAN");
    expect(lines[1]).toBe('7/6/2026;sabre;m;senior;Coupe de Dourdan 2026;Dourdan 2026');
  });

  it('écrit général;FIE;national;rang,T pour un tireur ayant participé au tableau', () => {
    const out = exportResultsToFFF(comp, [
      {
        rank: 1,
        fencer: makeFencer({ lastName: 'Dupont', firstName: 'Jean', license: '123' }),
        eliminatedAt: 'Finale',
      },
    ]);
    const line = out.split('\n')[2];
    expect(line.startsWith('DUPONT,Jean,')).toBe(true);
    expect(line).toContain(';;123,');
    expect(line.endsWith(';1,T')).toBe(true);
  });

  it('marque P pour un tireur éliminé dans les poules', () => {
    const out = exportResultsToFFF(comp, [
      { rank: 9, fencer: makeFencer({ lastName: 'Martin' }), eliminatedAt: 'Poules' },
    ]);
    expect(out.split('\n')[2].endsWith(';9,P')).toBe(true);
  });

  it('trie par rang, met les rangs vides en dernier et omet les exclus', () => {
    const out = exportResultsToFFF(comp, [
      { rank: null, fencer: makeFencer({ lastName: 'Abandon' }) },
      { rank: 2, fencer: makeFencer({ lastName: 'Martin' }) },
      { rank: 1, fencer: makeFencer({ lastName: 'Dupont' }) },
      { rank: 3, fencer: makeFencer({ lastName: 'Exclu', status: FencerStatus.EXCLUDED }) },
    ]);
    const lines = out.split('\n');
    expect(lines.length).toBe(2 + 3);
    expect(lines[2].startsWith('DUPONT,')).toBe(true);
    expect(lines[3].startsWith('MARTIN,')).toBe(true);
    expect(lines[4].startsWith('ABANDON,')).toBe(true);
    expect(lines[4].endsWith(';,T')).toBe(true);
  });
});

describe('encodeFFFWin1252', () => {
  it('encode les accents en cp1252 (é = 0xE9, € = 0x80)', () => {
    expect(Array.from(encodeFFFWin1252('é€'))).toEqual([0xe9, 0x80]);
  });

  it('remplace les caractères hors cp1252 par ?', () => {
    expect(Array.from(encodeFFFWin1252('中'))).toEqual([0x3f]);
  });
});
