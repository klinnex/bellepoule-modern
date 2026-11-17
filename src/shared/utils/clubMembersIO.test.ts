/**
 * Mode Club (membres) : format d'échange CSV / Excel de l'annuaire (aller-retour, dates, erreurs).
 */
import { describe, it, expect } from 'vitest';
import { Weapon } from '../types';
import { parseDelimited } from './clubInventoryIO';
import { toCsv } from './clubInventory';
import { isMemberTable, membersToRows, rowsToMembers } from './clubMembersIO';
import { exportClubMembersToFFF } from './fencerExport';

const member = (over: Record<string, unknown> = {}) => ({
  lastName: 'Dupont',
  firstName: 'Anne',
  license: '123456',
  gender: 'F',
  birthDate: '2010-06-07',
  birthYear: 2010,
  weapons: [Weapon.FOIL, Weapon.EPEE],
  laterality: 'L' as const,
  category: 'M11',
  active: true,
  notes: 'Cadette; "forte"',
  ...over,
});

describe('membersToRows', () => {
  it('écrit les en-têtes français et les valeurs lisibles', () => {
    const rows = membersToRows([member(), member({ lastName: 'Martin', active: false })]);
    expect(rows[0]).toEqual([
      'Nom',
      'Prénom',
      'Licence',
      'Sexe',
      'Date de naissance',
      'Année de naissance',
      'Armes',
      'Latéralité',
      'Catégorie',
      'Actif',
      'Notes',
    ]);
    expect(rows[1]).toEqual([
      'Dupont',
      'Anne',
      '123456',
      'F',
      '07/06/2010',
      2010,
      'Fleuret, Épée',
      'Gaucher',
      'M11',
      'Oui',
      'Cadette; "forte"',
    ]);
    expect(rows[2][9]).toBe('Non');
  });

  it('laisse vides les champs absents', () => {
    const rows = membersToRows([{ lastName: 'Léo', firstName: '', weapons: [], active: true }]);
    expect(rows[1]).toEqual(['Léo', '', '', '', '', '', '', '', '', 'Oui', '']);
  });
});

describe('aller-retour CSV', () => {
  it('se relit à l’identique (nom, licence, sexe, dates, armes, notes)', () => {
    const csv = toCsv(membersToRows([member()]));
    const { members, error } = rowsToMembers(parseDelimited(csv));
    expect(error).toBeUndefined();
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      lastName: 'Dupont',
      firstName: 'Anne',
      license: '123456',
      gender: 'F',
      birthDate: '2010-06-07',
      birthYear: 2010,
      weapons: [Weapon.FOIL, Weapon.EPEE],
      laterality: 'L',
      category: 'M11',
      active: true,
      notes: 'Cadette; "forte"',
    });
  });
});

describe('rowsToMembers', () => {
  it('reconnaît les colonnes sans accents, ni casse, dans un ordre libre', () => {
    const rows = [
      ['prenom', 'NOM', 'Date de naissance'],
      ['Léo', 'Martin', '12/03/2012'],
    ];
    const { members } = rowsToMembers(rows);
    expect(members).toEqual([
      {
        lastName: 'Martin',
        firstName: 'Léo',
        active: true,
        birthDate: '2012-03-12',
        birthYear: 2012,
      },
    ]);
  });

  it("accepte l'année seule, et refuse les années hors plage", () => {
    const rows = [
      ['Nom', 'Prénom', 'Année de naissance'],
      ['A', 'B', '2011'],
      ['C', 'D', '1500'],
    ];
    const { members } = rowsToMembers(rows);
    expect(members[0].birthYear).toBe(2011);
    expect(members[0].birthDate).toBeUndefined();
    expect(members[1].birthYear).toBeUndefined();
  });

  it('accepte les sexes et latéralités en libellés français', () => {
    const rows = [
      ['Nom', 'Prénom', 'Sexe', 'Latéralité', 'Armes'],
      ['A', 'B', 'Homme', 'Droitier', 'sabre laser; Fleuret'],
      ['C', 'D', 'femme', 'gaucher', 'inconnue'],
    ];
    const { members } = rowsToMembers(rows);
    expect(members[0]).toMatchObject({
      gender: 'M',
      laterality: 'R',
      weapons: [Weapon.LASER, Weapon.FOIL],
    });
    expect(members[1]).toMatchObject({ gender: 'F', laterality: 'L' });
    expect(members[1].weapons).toBeUndefined();
  });

  it('marque archivé un membre dont Actif vaut Non', () => {
    const rows = [
      ['Nom', 'Prénom', 'Actif'],
      ['A', 'B', 'Non'],
      ['C', 'D', 'Oui'],
    ];
    const { members } = rowsToMembers(rows);
    expect(members.map(m => m.active)).toEqual([false, true]);
  });

  it('ignore les lignes sans nom ni prénom', () => {
    const rows = [
      ['Nom', 'Prénom'],
      ['', ''],
      ['Dupont', ''],
    ];
    expect(rowsToMembers(rows).members).toEqual([
      { lastName: 'Dupont', firstName: '', active: true },
    ]);
  });

  it('refuse un fichier sans colonne Nom', () => {
    expect(rowsToMembers([['Prénom'], ['Anne']])).toEqual({
      members: [],
      error: 'Colonne « Nom » absente',
    });
  });

  it('refuse un fichier vide', () => {
    expect(rowsToMembers([]).error).toBe('Fichier vide');
  });
});

describe('isMemberTable', () => {
  it('reconnaît une table avec une colonne Nom', () => {
    expect(isMemberTable([['Nom', 'Licence']])).toBe(true);
  });

  it('ne prend pas pour une table un fichier FFF ni une table sans Nom', () => {
    const fff = exportClubMembersToFFF('Club', [{ firstName: 'Anne', lastName: 'Dupont' }]);
    expect(isMemberTable(parseDelimited(fff))).toBe(false);
    expect(isMemberTable([['Prénom', 'Licence']])).toBe(false);
  });
});
