import { describe, it, expect } from 'vitest';
import { Gender, type Fencer } from '../types';
import type { ClubMember } from '../types/club';
import { classifyClubImport, fencersToClubMembers, planClubImport } from './clubImport';

const existing = (id: string, extra: Partial<ClubMember>): ClubMember => ({
  id,
  firstName: '',
  lastName: '',
  weapons: [],
  active: true,
  cardCode: 'A1B2C3D4E5',
  createdAt: '',
  updatedAt: '',
  ...extra,
});

describe('import des membres du club (#1872)', () => {
  it('tireurs → membres : licence, sexe, année de naissance ; lignes vides ignorées', () => {
    const rows = fencersToClubMembers([
      {
        lastName: ' MARTIN ',
        firstName: 'Anne',
        license: ' 123 ',
        gender: Gender.FEMALE,
        birthDate: new Date(2010, 1, 1),
      },
      { lastName: 'DURAND', firstName: 'Paul', gender: Gender.MIXED },
      { lastName: '', firstName: '' },
    ] as Partial<Fencer>[]);
    expect(rows).toEqual([
      { lastName: 'MARTIN', firstName: 'Anne', license: '123', gender: 'F', birthYear: 2010 },
      { lastName: 'DURAND', firstName: 'Paul' },
    ]);
  });

  it('dédoublonne par licence puis nom (accents/casse), complète sans écraser', () => {
    const plan = planClubImport(
      [
        existing('a', { lastName: 'Martin', firstName: 'Anne', license: '123' }),
        existing('b', { lastName: 'Léger', firstName: 'Éric' }),
        existing('c', { lastName: 'Roux', firstName: 'Zoé', license: '9', birthYear: 2001 }),
      ],
      [
        { lastName: 'MARTIN-X', firstName: 'Anne', license: '123' }, // même licence
        { lastName: 'LEGER', firstName: 'Eric', license: '777', birthYear: 2009 }, // même nom
        { lastName: 'ROUX', firstName: 'Zoe', birthYear: 1999 }, // rien à compléter
        { lastName: 'NEUF', firstName: 'Léa' },
        { lastName: 'Neuf', firstName: 'Lea' }, // doublon dans le fichier
      ]
    );
    expect(plan.create).toEqual([{ lastName: 'NEUF', firstName: 'Léa' }]);
    expect(plan.update).toEqual([{ id: 'b', data: { license: '777', birthYear: 2009 } }]);
    expect(plan.skipped).toBe(3);
  });

  it('statut par ligne, dans l’ordre du fichier', () => {
    const st = classifyClubImport(
      [existing('a', { lastName: 'Martin', firstName: 'Anne', license: '1' })],
      [
        { lastName: 'NEUF', firstName: 'Léa' },
        { lastName: 'MARTIN', firstName: 'Anne' },
        { lastName: 'MARTIN', firstName: 'Anne', birthYear: 2010 },
        { lastName: 'Neuf', firstName: 'Lea' },
      ]
    );
    expect(st.map(s => s.kind)).toEqual(['new', 'present', 'duplicate', 'duplicate']);
  });
});
