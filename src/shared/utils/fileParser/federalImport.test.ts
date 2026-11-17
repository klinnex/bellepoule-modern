/**
 * Import des fichiers de l'extranet fédéral (#1938).
 * Données entièrement fictives : structure calquée sur les fichiers réels de l'extranet FFE
 * (.zip = .xml ISO-8859-1 + .FFF UTF-8 + EngardeArbitres.txt UTF-8), sans aucune donnée réelle.
 */
import { describe, expect, it } from 'vitest';
import { Category, Gender, Weapon } from '../../types';
import { decodeXmlEntities, fencerKey } from './common';
import {
  federalDateToIso,
  guessFieldsFromFileName,
  normalizeFederalTime,
  parseCompetitionHeader,
} from './competitionHeader';
import {
  buildFederalImport,
  classifyFederalFile,
  resolveFederalFencers,
  resolveFederalTeams,
} from './federalImport';
import { decodeTextFile } from './detect';
import { parseXMLFile } from './xmlParser';

const IND_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<!DOCTYPE BaseCompetitionIndividuelle>
<BaseCompetitionIndividuelle xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Type="I" DateFichierXML="10.03.2027 18:00" DateFin="14.03.2027" DateDebut="14.03.2027" Date="14.03.2027" Annee="2026 - 2027" TitreLong="Circuit régional Sabre Dames M17" Categorie="M17" Federation="FFE" Domaine="R" Sexe="F" Arme="S" ID="123456" Championnat="FFE" Appel="8:30" Scratch="9:00"><Tireurs><Tireur Sexe="F" Points="850.00" Classement="12" Club="CLUB EXEMPLE" ID="900001" Licence="900001" Lateralite="D" Nation="FRA" DateNaissance="02.05.2010" Prenom="Élodie" Nom="DUPONT" Region="LIGUE EXEMPLE" Ligue="EXEMPLE" Departement="044"/><Tireur Sexe="F" Points="310.00" Classement="40" Club="AUTRE CLUB" ID="900002" Licence="900002" Lateralite="G" Nation="FRA" DateNaissance="19.09.2011" Prenom="Inès" Nom="N&apos;GUYEN" Region="LIGUE EXEMPLE" Ligue="EXEMPLE" Departement="044"/></Tireurs><Arbitres><Arbitre Categorie="R" Sexe="M" ID="800001" Club="CLUB EXEMPLE" Licence="800001" Nation="FRA" DateNaissance="01.01.1980" Prenom="Paul" Nom="MARTIN" Ligue="EXEMPLE"/></Arbitres></BaseCompetitionIndividuelle>`;

const IND_FFF = `\uFEFFFFF;UTF8;CLASSEMENT;FFE\r
10/03/2027;;;;\r
DUPONT,Élodie,02/05/2010,F,FRA;,,;900001,EXEMPLE,CLUB EXEMPLE,12,850.00;\r
N'GUYEN,Inès,19/09/2011,F,FRA;,,;900002,EXEMPLE,AUTRE CLUB,40,310.00;\r
`;

const REFEREES_TXT = `\uFEFFnom;prenom;sexe;categorie;club;ligue;nation;date_nais;licence_fie;licence;\r
MARTIN;Paul;M;R;CLUB EXEMPLE;EXEMPLE;FRA;01/01/1980;;800001;\r
BERNARD;Julie;F;D;AUTRE CLUB;EXEMPLE;FRA;02/02/1990;;800002;\r
`;

const EMPTY_REFEREES_TXT = `\uFEFFnom;prenom;sexe;categorie;club;ligue;nation;date_nais;licence_fie;licence;\r\n`;

const TEAM_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<!DOCTYPE BaseCompetitionParEquipes>
<BaseCompetitionParEquipes Type="E" DateFichierXML="10.06.2027 12:00" DateFin="20.06.2027" DateDebut="20.06.2027" Date="20.06.2027" Annee="2026 - 2027" TitreLong="Nationale exemple" Categorie="SENIOR" Federation="FFE" Domaine="C" Sexe="M" Arme="F" ID="654321" Championnat="FFE"><Tireurs>${[
  ['900101', 'DURAND', 'Hugo', 'CLUB EXEMPLE 1'],
  ['900102', 'LEROY', 'Noé', 'CLUB EXEMPLE 1'],
  ['900103', 'MOREAU', 'Léo', 'CLUB EXEMPLE 1'],
  ['900104', 'PETIT', 'Jules', 'CLUB EXEMPLE 1'],
  ['900201', 'ROUX', 'Adam', 'AUTRE CLUB 1'],
  ['900202', 'FAURE', 'Tom', 'AUTRE CLUB 1'],
]
  .map(
    ([lic, nom, prenom, equipe]) =>
      `<Tireur Sexe="M" Club="${equipe.replace(/ 1$/, '')}" ID="${lic}" Licence="${lic}" Nation="FRA" DateNaissance="01.01.2000" Prenom="${prenom}" Nom="${nom}" Equipe="${equipe}"/>`
  )
  .join('')}</Tireurs><Arbitres/><Equipes/></BaseCompetitionParEquipes>`;

describe('decodeXmlEntities', () => {
  it('décode les entités nommées et numériques en un seul passage', () => {
    expect(decodeXmlEntities('N&apos;GUYEN')).toBe("N'GUYEN");
    expect(decodeXmlEntities('&#201;lodie &#xE9;')).toBe('Élodie é');
    expect(decodeXmlEntities('A &amp; B')).toBe('A & B');
    expect(decodeXmlEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeXmlEntities('&inconnue; &#0;')).toBe('&inconnue; &#0;');
  });
});

describe('parseXMLFile (#1938)', () => {
  it('décode les entités, lit la date de naissance', () => {
    const r = parseXMLFile(IND_XML);
    expect(r.fencers[1].lastName).toBe("N'GUYEN");
    expect(r.fencers[1].handedness).toBe('L');
    expect(r.fencers[0].birthDate).toEqual(new Date(2010, 4, 2));
    expect(r.teams).toBeUndefined();
  });

  it("reconstitue les équipes depuis l'attribut Equipe (section <Equipes/> vide)", () => {
    const r = parseXMLFile(TEAM_XML);
    expect(r.teams?.map(t => [t.name, t.club, t.members.length])).toEqual([
      ['CLUB EXEMPLE 1', 'CLUB EXEMPLE', 4],
      ['AUTRE CLUB 1', 'AUTRE CLUB', 2],
    ]);
    expect(r.teams?.[0].members[0]).toBe(fencerKey({ license: '900101' }));
  });

  it('utilise le nom de la section <Equipes> quand Equipe référence un ID', () => {
    const xml = `<BaseCompetitionParEquipes Type="E"><Tireurs><Tireur Nom="A" Prenom="B" Licence="1" Equipe="7"/></Tireurs><Equipes><Equipe ID="7" Nom="CLUB X 1" Club="CLUB X"/></Equipes></BaseCompetitionParEquipes>`;
    expect(parseXMLFile(xml).teams).toEqual([
      { name: 'CLUB X 1', club: 'CLUB X', members: ['L:1'] },
    ]);
  });
});

describe('parseCompetitionHeader', () => {
  it('lit les valeurs brutes et les fait correspondre au formulaire', () => {
    const h = parseCompetitionHeader(IND_XML)!;
    expect(h.federal).toMatchObject({
      id: '123456',
      season: '2026 - 2027',
      domain: 'R',
      category: 'M17',
      type: 'I',
      fileDate: '10.03.2027 18:00',
    });
    expect(h.fields).toMatchObject({
      title: 'Circuit régional Sabre Dames M17',
      date: '2027-03-14',
      weapon: Weapon.SABRE,
      gender: Gender.FEMALE,
      category: Category.U17,
      isTeamEvent: false,
      checkInTime: '08:30',
      scratchTime: '09:00',
      startTime: undefined,
    });
    expect(h.notices).toEqual([]);
  });

  it('reconnaît une épreuve par équipes', () => {
    const h = parseCompetitionHeader(TEAM_XML)!;
    expect(h.fields.isTeamEvent).toBe(true);
    expect(h.fields.category).toBe(Category.SENIOR);
    expect(h.federal.domain).toBe('C');
  });

  it('ignore le DOCTYPE et signale les valeurs inconnues', () => {
    const h = parseCompetitionHeader(
      '<!DOCTYPE CompetitionIndividuelle><CompetitionIndividuelle Arme="Z" Sexe="Q" Categorie="M23" Date="31.02.2027">'
    )!;
    expect(h.notices.map(n => n.code)).toEqual([
      'unknownWeapon',
      'unknownGender',
      'unknownCategory',
      'invalidDate',
    ]);
    expect(parseCompetitionHeader('<Autre/>')).toBeNull();
  });

  it('normalise dates et heures', () => {
    expect(federalDateToIso('6.6.2027')).toBe('2027-06-06');
    expect(normalizeFederalTime('8h05')).toBe('08:05');
    expect(normalizeFederalTime('25:00')).toBeUndefined();
    expect(normalizeFederalTime('')).toBeUndefined();
  });
});

describe('guessFieldsFromFileName', () => {
  it("lit arme / sexe / catégorie du nom de fichier de l'extranet", () => {
    expect(guessFieldsFromFileName('EngardeFHM15.FFF')).toEqual({
      weapon: Weapon.FOIL,
      gender: Gender.MALE,
      category: Category.U15,
    });
    expect(guessFieldsFromFileName('CHAMPIONNAT_EXEMPLE_SDSENIOR_equ.zip').gender).toBe(
      Gender.FEMALE
    );
    expect(guessFieldsFromFileName('inscrits.fff')).toEqual({});
  });
});

describe('buildFederalImport', () => {
  const zip = [
    { name: 'EngardeSDM17.xml', content: IND_XML },
    { name: 'EngardeSDM17.FFF', content: IND_FFF },
    { name: 'EngardeArbitres.txt', content: REFEREES_TXT },
  ];

  it('classe les fichiers du .zip', () => {
    expect(zip.map(classifyFederalFile)).toEqual(['xml', 'fff', 'referees']);
    expect(classifyFederalFile({ name: 'x.txt', content: IND_FFF })).toBe('fff');
    expect(classifyFederalFile({ name: 'x.txt', content: 'bonjour' })).toBe('unknown');
  });

  it('fusionne xml / fff / txt sans doublon ni incohérence', () => {
    const imp = buildFederalImport(zip);
    expect(imp.header?.federal.id).toBe('123456');
    expect(imp.conflicts).toEqual([]);
    expect(imp.notices).toEqual([]);
    expect(resolveFederalFencers(imp)).toHaveLength(2);
    // Arbitre du .txt prioritaire, celui du XML déjà présent n'est pas dupliqué
    expect(imp.referees.map(r => r.lastName)).toEqual(['MARTIN', 'BERNARD']);
  });

  it('signale les écarts xml / fff, la source choisie fait foi', () => {
    const fff = IND_FFF.replace('AUTRE CLUB,40', 'CLUB TROIS,41').replace(
      /N'GUYEN[^\n]*\n/,
      match => `${match}BLANC,Lou,03/03/2010,F,FRA;,,;900003,EXEMPLE,CLUB EXEMPLE,,;\r\n`
    );
    const imp = buildFederalImport([zip[0], { name: 'a.fff', content: fff }]);
    expect(imp.conflicts.map(c => [c.lastName, c.field, c.xml, c.fff])).toEqual([
      ["N'GUYEN", 'club', 'AUTRE CLUB', 'CLUB TROIS'],
      ["N'GUYEN", 'ranking', '40', '41'],
      ['BLANC', 'onlyInFff', undefined, undefined],
    ]);
    const fromXml = resolveFederalFencers(imp, 'xml');
    expect(fromXml.map(f => f.club)).toEqual(['CLUB EXEMPLE', 'AUTRE CLUB']);
    const fromFff = resolveFederalFencers(imp, 'fff');
    expect(fromFff.map(f => f.club)).toEqual(['CLUB EXEMPLE', 'CLUB TROIS', 'CLUB EXEMPLE']);
    // Complément depuis le XML : latéralité absente du FFF
    expect(fromFff[1].handedness).toBe('L');
  });

  it("signale un fichier d'arbitres vide sans bloquer", () => {
    const imp = buildFederalImport([
      { name: 'EngardeFHSENIOR.xml', content: TEAM_XML },
      { name: 'EngardeArbitres.txt', content: EMPTY_REFEREES_TXT },
    ]);
    expect(imp.notices.map(n => n.code)).toEqual(['refereesEmpty', 'teamTooSmall']);
    expect(imp.teams).toHaveLength(2);
  });

  it('réduit les équipes aux tireurs retenus', () => {
    const imp = buildFederalImport([{ name: 'e.xml', content: TEAM_XML }]);
    const fencers = resolveFederalFencers(imp).slice(0, 3);
    expect(resolveFederalTeams(imp.teams, fencers).map(t => t.members.length)).toEqual([3]);
  });

  it('sans XML : tireurs du FFF, champs devinés depuis le nom de fichier', () => {
    const imp = buildFederalImport([{ name: 'EngardeSDM17.FFF', content: IND_FFF }]);
    expect(imp.header).toBeNull();
    expect(imp.fileNameGuess).toEqual({
      weapon: Weapon.SABRE,
      gender: Gender.FEMALE,
      category: Category.U17,
    });
    expect(resolveFederalFencers(imp)).toHaveLength(2);
  });
});

describe('encodages des fichiers réels', () => {
  it('XML annoncé ISO-8859-1 mais écrit en UTF-8 : décodé en UTF-8', () => {
    const bytes = new TextEncoder().encode(
      '<?xml version="1.0" encoding="iso-8859-1"?><CompetitionParEquipes Ligue="BOUCHES-DU-RHÔNE"/>'
    );
    expect(decodeTextFile(bytes)).toContain('RHÔNE');
  });

  it('XML réellement en ISO-8859-1 : repli Windows-1252', () => {
    const text = '<BaseCompetitionIndividuelle TitreLong="Épreuve"/>';
    const bytes = Uint8Array.from([...text].map(c => c.charCodeAt(0)));
    expect(parseCompetitionHeader(decodeTextFile(bytes))?.fields.title).toBe('Épreuve');
  });
});
