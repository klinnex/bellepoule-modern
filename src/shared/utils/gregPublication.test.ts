import { describe, it, expect } from 'vitest';
import { Category, Gender, Weapon } from '../types';
import {
  buildGregFields,
  gregFileName,
  toNativeRootTag,
  type GregCompetition,
} from './gregPublication';

const base: GregCompetition = {
  title: 'Challenge Béta / 2026',
  date: new Date(2026, 9, 3),
  location: 'Salle Paul Ducos',
  weapon: Weapon.EPEE,
  gender: Gender.MALE,
  category: Category.SENIOR,
  isTeamEvent: false,
  status: 'in_progress',
};

describe('buildGregFields (#1328)', () => {
  it('traduit une compétition individuelle en champs GREG', () => {
    expect(buildGregFields(base)).toEqual({
      type_competition: 'CompetitionIndividuelle',
      indivouequipe: 'indiv',
      'dp-normal-1': '03.10.2026',
      lieu: 'Salle Paul Ducos',
      niveau: 'X',
      Division: '',
      arme: 'E',
      genre: 'H',
      categorie: 'S',
      status: 'L',
    });
  });

  it('bascule sur les équipes, le sexe féminin et le statut terminé', () => {
    const fields = buildGregFields({
      ...base,
      isTeamEvent: true,
      gender: Gender.FEMALE,
      status: 'completed',
      weapon: Weapon.SABRE,
    });
    expect(fields.type_competition).toBe('CompetitionParEquipes');
    expect(fields.indivouequipe).toBe('equipe');
    expect(fields.genre).toBe('D');
    expect(fields.status).toBe('D');
    expect(fields.arme).toBe('S');
  });

  it("mixte = H comme dans l'ancien BellePoule", () => {
    expect(buildGregFields({ ...base, gender: Gender.MIXED }).genre).toBe('H');
  });

  it("refuse une compétition sans lieu (le serveur l'exige)", () => {
    expect(() => buildGregFields({ ...base, location: '  ' })).toThrow(/lieu/);
    expect(() => buildGregFields({ ...base, location: undefined })).toThrow(/lieu/);
  });

  it('refuse les armes et catégories sans code GREG', () => {
    expect(() => buildGregFields({ ...base, weapon: Weapon.LASER })).toThrow(/Arme/);
    expect(() => buildGregFields({ ...base, category: 'U99' as Category })).toThrow(/Catégorie/);
  });

  it('mappe les catégories jeunes sur leur code M<âge>', () => {
    expect(buildGregFields({ ...base, category: Category.U13 }).categorie).toBe('M13');
    expect(buildGregFields({ ...base, category: Category.V2 }).categorie).toBe('V2');
  });
});

describe('gregFileName (#1328)', () => {
  it('produit un nom sûr avec extension .xml', () => {
    expect(gregFileName('Challenge Béta / 2026')).toBe('resultats_Challenge_B_ta___2026.xml');
  });
});

describe('toNativeRootTag (#1328)', () => {
  const xml = '<CompetitionParEquipe Couleur="#fff" ID="x"><Tireurs/></CompetitionParEquipe>';

  it('passe au pluriel pour les équipes', () => {
    expect(toNativeRootTag(xml, true)).toBe(
      '<CompetitionParEquipes Couleur="#fff" ID="x"><Tireurs/></CompetitionParEquipes>'
    );
  });

  it('laisse le XML individuel intact', () => {
    const individual = '<CompetitionIndividuelle ID="x"></CompetitionIndividuelle>';
    expect(toNativeRootTag(individual, false)).toBe(individual);
  });
});
