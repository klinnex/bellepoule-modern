/**
 * Mode Club (#1872) : export FFF des membres, réimportable par l'import du club.
 */
import { describe, expect, it } from 'vitest';
import { exportClubMembersToFFF } from './fencerExport';
import { parseFFEFile } from './fileParser';
import { fencersToClubMembers } from './clubImport';

describe('exportClubMembersToFFF', () => {
  const members = [
    {
      firstName: 'Anne',
      lastName: 'Dupont',
      license: '123456',
      gender: 'F',
      birthDate: '2010-06-07',
    },
    { firstName: 'Léo', lastName: 'Martin; fils', gender: 'X' },
  ];

  it('écrit en-tête et lignes FFF', () => {
    const lines = exportClubMembersToFFF('Cercle, Escrime', members).split('\n');
    expect(lines[0]).toBe('FFF;UTF8;COMPETITION;Cercle Escrime');
    expect(lines[1]).toBe('DUPONT,Anne,7/6/2010,F,FRA;;123456,,Cercle Escrime,,,;1,');
    expect(lines[2]).toBe('MARTIN FILS,Léo,,,FRA;;,,Cercle Escrime,,,;2,');
  });

  it('se réimporte (nom, licence, sexe, date)', () => {
    const parsed = parseFFEFile(exportClubMembersToFFF('Club', members));
    const rows = fencersToClubMembers(parsed.fencers);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      lastName: 'DUPONT',
      firstName: 'Anne',
      license: '123456',
      gender: 'F',
      birthDate: '2010-06-07',
    });
    expect(rows[1]).toMatchObject({ lastName: 'MARTIN FILS', firstName: 'Léo' });
  });
});
