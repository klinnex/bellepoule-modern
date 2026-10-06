/**
 * Tests unitaires - Export des tireurs (TXT / FFF)
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import { exportFencersToFFF, exportFencersToTXT } from './fencerExport';
import { Fencer, Gender, FencerStatus } from '../types';

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
