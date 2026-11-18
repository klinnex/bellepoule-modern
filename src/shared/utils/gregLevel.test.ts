import { describe, it, expect } from 'vitest';
import { Category, Gender, Weapon } from '../types';
import {
  GREG_DEFAULT_LEVEL,
  GREG_LEVELS,
  buildGregFields,
  isGregLevel,
  levelFromFederalDomain,
  type GregCompetition,
} from './gregPublication';
import { parseCompetitionHeader } from './fileParser/competitionHeader';
import { exportResultsXMLFFE } from './multiFormatExport';

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

describe('niveau GREG (#1328)', () => {
  it('garde les 7 codes de l’ancien BellePoule, « Autre » par défaut', () => {
    expect(GREG_LEVELS).toEqual(['L', 'Z', 'CN', 'A', 'F', 'IE', 'X']);
    expect(GREG_DEFAULT_LEVEL).toBe('X');
    expect(isGregLevel('CN')).toBe(true);
    expect(isGregLevel('')).toBe(false);
    expect(isGregLevel('Q')).toBe(false);
  });

  it('envoie le niveau choisi dans le champ niveau du formulaire', () => {
    const fields = buildGregFields({ ...base, settings: { gregLevel: 'Z' } as never });
    expect(fields.niveau).toBe('Z');
  });

  it('envoie « Autre » tant qu’aucun niveau n’est choisi', () => {
    expect(buildGregFields(base).niveau).toBe('X');
  });
});

describe('levelFromFederalDomain (#1328)', () => {
  it('propose le niveau d’après le Domaine de l’extranet', () => {
    expect(levelFromFederalDomain('L')).toBe('L');
    expect(levelFromFederalDomain('R')).toBe('Z');
    expect(levelFromFederalDomain('N', 'Circuit national Sabre')).toBe('CN');
    expect(levelFromFederalDomain('N', 'Championnats de France Épée')).toBe('F');
    expect(levelFromFederalDomain('N', 'Championnat de France')).toBe('F');
  });

  it('retombe sur « Autre » pour I, C, * et les valeurs inconnues', () => {
    expect(levelFromFederalDomain('I')).toBe('X');
    expect(levelFromFederalDomain('C')).toBe('X');
    expect(levelFromFederalDomain('*')).toBe('X');
    expect(levelFromFederalDomain('Z')).toBe('X');
  });

  it('ne propose rien sans Domaine', () => {
    expect(levelFromFederalDomain(undefined)).toBeUndefined();
    expect(levelFromFederalDomain('')).toBeUndefined();
  });
});

describe('niveau à l’import (#1328)', () => {
  const xml = (attrs: string) =>
    `<CompetitionIndividuelle Type="I" Arme="F" Sexe="M" Categorie="SENIOR" Date="03.10.2026" TitreLong="Challenge" ${attrs}><Tireurs/></CompetitionIndividuelle>`;

  it('lit l’attribut Niveau d’un fichier BellePoule', () => {
    expect(parseCompetitionHeader(xml('Niveau="IE"'))?.fields.gregLevel).toBe('IE');
  });

  it('propose le niveau d’après Domaine quand Niveau est absent', () => {
    expect(parseCompetitionHeader(xml('Domaine="R"'))?.fields.gregLevel).toBe('Z');
  });

  it('n’invente rien sans Niveau ni Domaine', () => {
    expect(parseCompetitionHeader(xml(''))?.fields.gregLevel).toBeUndefined();
  });
});

describe('export XML : attribut Niveau (#1328)', () => {
  it('écrit « X » par défaut et le niveau choisi sinon', () => {
    const competition = {
      title: 'Challenge',
      date: new Date(2026, 9, 3),
      weapon: Weapon.FOIL,
      gender: Gender.MALE,
      category: Category.SENIOR,
      isTeamEvent: false,
      color: '',
      settings: {},
    };
    const xmlDefault = exportResultsXMLFFE(competition as never, [], [], []);
    expect(xmlDefault).toMatch(/ Niveau="X"/);

    const xmlChosen = exportResultsXMLFFE(
      { ...competition, settings: { gregLevel: 'CN' } } as never,
      [],
      [],
      []
    );
    expect(xmlChosen).toMatch(/ Niveau="CN"/);
  });
});
