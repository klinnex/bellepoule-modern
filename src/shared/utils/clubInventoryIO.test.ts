/**
 * Mode Club : format d'échange CSV / Excel de l'inventaire (aller-retour, erreurs, dates).
 */
import { describe, it, expect } from 'vitest';
import { itemsToRows, parseDelimited, rowsToItems, toIsoDate } from './clubInventoryIO';
import type { ClubItem } from '../types/club';
import { toCsv } from './clubInventory';
import { Weapon } from '../types';

const item = (over: Partial<ClubItem> = {}): ClubItem => ({
  id: 'i',
  clubId: 'c',
  name: 'Épée',
  category: 'weapon',
  weapon: Weapon.EPEE,
  brand: 'Uhlmann',
  serialNumber: 'SN-1',
  quantity: 2,
  purchaseDate: '2026-09-01',
  purchasePrice: 180.5,
  warrantyUntil: '2027-09-01',
  condition: 'worn',
  location: 'Armoire 2',
  notes: 'Garde "neuve"; à vérifier',
  retired: false,
  lentQuantity: 1,
  availableQuantity: 1,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('parseDelimited', () => {
  it('lit le CSV « ; » avec guillemets, retours ligne et BOM', () => {
    const rows = parseDelimited('﻿Nom;Notes\r\n"A ""B"""; "x;y"\r\nC;\r\n');
    expect(rows).toEqual([
      ['Nom', 'Notes'],
      ['A "B"', 'x;y'],
      ['C', ''],
    ]);
  });

  it('détecte la virgule si c’est le séparateur', () => {
    expect(parseDelimited('Nom,Marque\nMasque,Allstar')).toEqual([
      ['Nom', 'Marque'],
      ['Masque', 'Allstar'],
    ]);
  });

  it('ignore les lignes vides', () => {
    expect(parseDelimited('Nom\n\n;\nA\n')).toEqual([['Nom'], ['A']]);
  });
});

describe('toIsoDate', () => {
  it('accepte ISO, dd/mm/aaaa et numéro de série Excel', () => {
    expect(toIsoDate('2026-09-01')).toBe('2026-09-01');
    expect(toIsoDate('1/9/2026')).toBe('2026-09-01');
    expect(toIsoDate('46266')).toBe('2026-09-01');
    expect(toIsoDate('')).toBeUndefined();
  });
});

describe('itemsToRows / rowsToItems', () => {
  it('aller-retour sans perte des champs utiles', () => {
    const rows = itemsToRows([item()]);
    expect(rows[0][0]).toBe('Nom');
    const { items, errors } = rowsToItems(parseDelimited(toCsv(rows)));
    expect(errors).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: 'Épée',
      category: 'weapon',
      weapon: 'E',
      brand: 'Uhlmann',
      serialNumber: 'SN-1',
      quantity: 2,
      purchaseDate: '2026-09-01',
      purchasePrice: 180.5,
      warrantyUntil: '2027-09-01',
      condition: 'worn',
      location: 'Armoire 2',
      notes: 'Garde "neuve"; à vérifier',
      retired: false,
    });
  });

  it('accepte les libellés français, les codes internes et les colonnes dans un ordre quelconque', () => {
    const { items, errors } = rowsToItems([
      ['Marque', 'Catégorie', 'NOM', 'État', 'Réformé', "Prix d'achat (€)", 'Arme'],
      ['Allstar', 'Masque', 'Masque A', 'hors service', 'oui', '12,5', 'Fleuret'],
      ['Gant', 'glove', 'Gant B', 'Bon état', 'non', '', 'L'],
    ]);
    expect(errors).toEqual([]);
    expect(items[0]).toMatchObject({
      name: 'Masque A',
      category: 'mask',
      condition: 'out_of_service',
      retired: true,
      purchasePrice: 12.5,
      weapon: 'F',
    });
    expect(items[1]).toMatchObject({ category: 'glove', weapon: 'L', purchasePrice: undefined });
  });

  it('signale les lignes invalides sans bloquer les autres', () => {
    const { items, errors } = rowsToItems([
      ['Nom', "Date d'achat", 'Fin de garantie'],
      ['Bon', '2026-01-01', ''],
      ['', '', ''],
      ['Mauvais', 'pas une date', ''],
      ['Garantie absurde', '2026-05-01', '2026-04-01'],
    ]);
    expect(items.map(i => i.name)).toEqual(['Bon']);
    expect(errors.map(e => e.line)).toEqual([4, 5]);
    expect(errors[1].message).toContain('garantie');
  });

  it('refuse un fichier sans colonne Nom', () => {
    const r = rowsToItems([['Marque'], ['Allstar']]);
    expect(r.items).toEqual([]);
    expect(r.errors[0].message).toContain('Nom');
  });

  it('convertit les dates Excel numériques des colonnes de date', () => {
    const { items } = rowsToItems([
      ['Nom', "Date d'achat"],
      ['Veste', '46266'],
    ]);
    expect(items[0].purchaseDate).toBe('2026-09-01');
  });
});
