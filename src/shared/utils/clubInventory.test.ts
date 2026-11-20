/**
 * Mode Club : utilitaires d'inventaire (validation, retards, garanties, synthèse, CSV).
 */
import { describe, it, expect } from 'vitest';
import {
  addDays,
  computeInventorySummary,
  isLoanOverdue,
  isWarrantyAlert,
  localIsoDate,
  normalizeItemInput,
  seriesNames,
  toCsv,
} from './clubInventory';
import type { ClubItem } from '../types/club';
import { Weapon } from '../types';

const item = (over: Partial<ClubItem> = {}): ClubItem => ({
  id: 'i',
  clubId: 'c',
  name: 'Masque',
  category: 'mask',
  quantity: 1,
  condition: 'good',
  retired: false,
  lentQuantity: 0,
  availableQuantity: 1,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('normalizeItemInput', () => {
  it('exige un nom', () => {
    expect(() => normalizeItemInput({ name: '   ', category: 'mask' })).toThrow('Nom');
  });

  it('applique les valeurs par défaut et nettoie le texte', () => {
    const e = normalizeItemInput({ name: '  Veste  ', category: 'nope' as never, brand: ' ' });
    expect(e.name).toBe('Veste');
    expect(e.category).toBe('other');
    expect(e.brand).toBeUndefined();
    expect(e.quantity).toBe(1);
    expect(e.condition).toBe('good');
    expect(e.retired).toBe(false);
  });

  it('borne la quantité et arrondit le prix', () => {
    const e = normalizeItemInput({
      name: 'x',
      category: 'glove',
      quantity: 5000,
      purchasePrice: 12.345,
    });
    expect(e.quantity).toBe(999);
    expect(e.purchasePrice).toBe(12.35);
  });

  it('refuse un prix négatif ou absurde', () => {
    expect(() => normalizeItemInput({ name: 'x', category: 'bag', purchasePrice: -1 })).toThrow(
      'Prix'
    );
    expect(() => normalizeItemInput({ name: 'x', category: 'bag', purchasePrice: 1e9 })).toThrow(
      'Prix'
    );
  });

  it('refuse une date mal formée', () => {
    expect(() =>
      normalizeItemInput({ name: 'x', category: 'bag', purchaseDate: '01/02/2026' })
    ).toThrow("d'achat");
  });

  it('refuse une garantie qui finit avant l’achat', () => {
    expect(() =>
      normalizeItemInput({
        name: 'x',
        category: 'bag',
        purchaseDate: '2026-05-01',
        warrantyUntil: '2026-04-30',
      })
    ).toThrow('garantie');
  });

  it('ignore une arme inconnue', () => {
    expect(
      normalizeItemInput({ name: 'x', category: 'weapon', weapon: 'Z' as never }).weapon
    ).toBeUndefined();
    expect(normalizeItemInput({ name: 'x', category: 'weapon', weapon: Weapon.FOIL }).weapon).toBe(
      'F'
    );
  });
});

describe('dates et retards', () => {
  it('localIsoDate formate en AAAA-MM-JJ local', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('addDays gère les fins de mois', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-11-16', 90)).toBe('2027-02-14');
  });

  it('un prêt est en retard après l’échéance, jamais une fois rendu', () => {
    expect(isLoanOverdue({ dueDate: '2026-05-01' }, '2026-05-02')).toBe(true);
    expect(isLoanOverdue({ dueDate: '2026-05-02' }, '2026-05-02')).toBe(false);
    expect(isLoanOverdue({ dueDate: '2026-05-01', returnedAt: '2026-04-30' }, '2026-05-02')).toBe(
      false
    );
    expect(isLoanOverdue({}, '2026-05-02')).toBe(false);
  });

  it('alerte garantie : expire dans les 90 jours, pas si déjà expirée', () => {
    expect(isWarrantyAlert('2026-12-01', '2026-11-16')).toBe(true);
    expect(isWarrantyAlert('2027-06-01', '2026-11-16')).toBe(false);
    expect(isWarrantyAlert('2026-11-01', '2026-11-16')).toBe(false);
    expect(isWarrantyAlert(undefined, '2026-11-16')).toBe(false);
  });
});

describe('computeInventorySummary', () => {
  it('compte hors réformés, valeur et prêts', () => {
    const items = [
      item({ id: 'a', quantity: 3, purchasePrice: 10, category: 'mask' }),
      item({ id: 'b', quantity: 2, category: 'glove' }),
      item({ id: 'c', quantity: 4, purchasePrice: 99, retired: true }),
      item({ id: 'd', quantity: 1, warrantyUntil: '2026-12-15' }),
    ];
    const loans = [
      { quantity: 2, dueDate: '2026-11-01' },
      { quantity: 1, dueDate: '2026-12-01' },
    ];
    const s = computeInventorySummary(items, loans, '2026-11-16');
    expect(s.lines).toBe(3);
    expect(s.units).toBe(6);
    expect(s.value).toBe(30);
    expect(s.valued).toBe(1);
    expect(s.lentUnits).toBe(3);
    expect(s.overdueLoans).toBe(1);
    expect(s.warrantyAlerts).toBe(1);
    expect(s.byCategory).toEqual({ mask: 4, glove: 2 });
  });
});

describe('toCsv', () => {
  it('séparateur ;, BOM, virgule décimale et échappement', () => {
    const csv = toCsv([
      ['Nom', 'Prix'],
      ['Masque "pro"; taille M', 12.5],
      ['Gant', undefined],
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Nom;Prix');
    expect(lines[1]).toBe('"Masque ""pro""; taille M";12,5');
    expect(lines[2]).toBe('Gant;');
  });
});

describe('seriesNames (ajout en série)', () => {
  it('numérote sur deux chiffres à partir de 01', () => {
    const n = seriesNames('Plastron', 15, []);
    expect(n).toHaveLength(15);
    expect(n[0]).toBe('Plastron-01');
    expect(n[14]).toBe('Plastron-15');
  });

  it('reprend après le plus grand suffixe existant, sans doublon (casse ignorée)', () => {
    const n = seriesNames('Plastron', 3, ['plastron-02', 'PLASTRON-07', 'Plastron', 'Masque-09']);
    expect(n).toEqual(['Plastron-08', 'Plastron-09', 'Plastron-10']);
  });

  it('ignore un suffixe déjà saisi dans le nom de base', () => {
    expect(seriesNames('Plastron-05 ', 1, ['Plastron-05'])).toEqual(['Plastron-06']);
  });

  it('élargit la numérotation au-delà de 99', () => {
    const n = seriesNames('Fil', 5, ['Fil-97']);
    expect(n).toEqual(['Fil-098', 'Fil-099', 'Fil-100', 'Fil-101', 'Fil-102']);
  });

  it('échappe les caractères spéciaux du nom', () => {
    expect(seriesNames('Gant (M)', 1, ['Gant (M)-04', 'Gant xMx-09'])).toEqual(['Gant (M)-05']);
  });

  it('refuse un nom vide', () => {
    expect(() => seriesNames('  ', 2, [])).toThrow();
  });
});
