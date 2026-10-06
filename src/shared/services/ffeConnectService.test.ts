/**
 * Tests unitaires - FFEConnectService (validation URL + mapping)
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import { FFEConnectService } from './ffeConnectService';
import { Gender, FencerStatus } from '../types';

describe('constructor', () => {
  it('accepte l’URL par défaut (https)', () => {
    expect(() => new FFEConnectService()).not.toThrow();
  });

  it('refuse une base non https', () => {
    expect(() => new FFEConnectService({ baseUrl: 'http://api.ffe.fr' })).toThrow(/HTTPS|invalide/);
  });

  it('refuse une URL invalide', () => {
    expect(() => new FFEConnectService({ baseUrl: 'pas-une-url' })).toThrow(/invalide/);
  });
});

describe('toFencer', () => {
  const svc = new FFEConnectService();
  const base = {
    nom: 'Dupont',
    prenom: 'Jean',
    club: 'CEP',
    ligue: 'IDF',
    licence: 'L123',
    nationalite: 'FRA',
    sexe: 'M' as const,
  };

  it('mappe les champs de base + statut par défaut', () => {
    const f = svc.toFencer(base as any);
    expect(f.lastName).toBe('Dupont');
    expect(f.firstName).toBe('Jean');
    expect(f.club).toBe('CEP');
    expect(f.region).toBe('IDF');
    expect(f.license).toBe('L123');
    expect(f.gender).toBe(Gender.MALE);
    expect(f.status).toBe(FencerStatus.NOT_CHECKED_IN);
  });

  it('mappe le sexe F vers FEMALE', () => {
    expect(svc.toFencer({ ...base, sexe: 'F' } as any).gender).toBe(Gender.FEMALE);
  });

  it('reporte le classement sur ranking et initialRanking', () => {
    const f = svc.toFencer({ ...base, classement: 42 } as any);
    expect(f.ranking).toBe(42);
    expect(f.initialRanking).toBe(42);
  });

  it('parse une date de naissance valide', () => {
    const f = svc.toFencer({ ...base, dateNaissance: '1990-05-01' } as any);
    expect(f.birthDate).toBeInstanceOf(Date);
    expect(f.birthDate?.getFullYear()).toBe(1990);
  });

  it('ignore une date de naissance invalide', () => {
    const f = svc.toFencer({ ...base, dateNaissance: 'n/a' } as any);
    expect(f.birthDate).toBeUndefined();
  });
});
