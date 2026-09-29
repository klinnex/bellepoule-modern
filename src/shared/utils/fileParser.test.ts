import { describe, it, expect } from 'vitest';
import {
  parseSimpleTXTFile,
  parseFFEFile,
  parseXMLFile,
  decodeTextFile,
  resolveFencerFileFormat,
} from './fileParser';
import { exportFencersToFFF } from './fencerExport';
import { Gender, FencerStatus, Fencer } from '../types';

// ============================================================================
// parseSimpleTXTFile
// ============================================================================

describe('parseSimpleTXTFile', () => {
  it('fichier vide → success=false, erreur', () => {
    const result = parseSimpleTXTFile('');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.fencers).toHaveLength(0);
  });

  it('fichier avec seulement des lignes vides → success=false', () => {
    const result = parseSimpleTXTFile('   \n\n   ');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('ligne header (nom/prenom) ignorée en position 0', () => {
    const content = 'NOM;PRENOM\nDUPONT;Jean';
    const result = parseSimpleTXTFile(content);
    expect(result.fencers).toHaveLength(1);
    expect(result.fencers[0].lastName).toBe('DUPONT');
  });

  it('header contenant "club" ignoré', () => {
    const content = 'NOM PRENOM CLUB\nDUPONT Jean';
    const result = parseSimpleTXTFile(content);
    expect(result.fencers).toHaveLength(1);
  });

  it('2 tireurs séparés par ;', () => {
    const content = 'DUPONT;Jean\nMARTIN;Marie';
    const result = parseSimpleTXTFile(content);
    expect(result.success).toBe(true);
    expect(result.fencers).toHaveLength(2);
    expect(result.fencers[0].lastName).toBe('DUPONT');
    expect(result.fencers[0].firstName).toBe('Jean');
    expect(result.fencers[1].lastName).toBe('MARTIN');
    expect(result.fencers[1].firstName).toBe('Marie');
  });

  it('2 tireurs séparés par virgule', () => {
    const content = 'DURAND,Pierre\nBERNARD,Sophie';
    const result = parseSimpleTXTFile(content);
    expect(result.success).toBe(true);
    expect(result.fencers).toHaveLength(2);
  });

  it('séparateur tabulation', () => {
    const content = 'LEROUX\tAlice';
    const result = parseSimpleTXTFile(content);
    expect(result.success).toBe(true);
    expect(result.fencers[0].lastName).toBe('LEROUX');
    expect(result.fencers[0].firstName).toBe('Alice');
  });

  it('extraction gender M', () => {
    const content = 'DUPONT;Jean;M';
    const result = parseSimpleTXTFile(content);
    expect(result.fencers[0].gender).toBe(Gender.MALE);
  });

  it('extraction gender F', () => {
    const content = 'MARTIN;Marie;F';
    const result = parseSimpleTXTFile(content);
    expect(result.fencers[0].gender).toBe(Gender.FEMALE);
  });

  it('gender H interprété comme MALE', () => {
    const content = 'DUPONT;Jean;H';
    const result = parseSimpleTXTFile(content);
    expect(result.fencers[0].gender).toBe(Gender.MALE);
  });

  it('gender absent → MIXED par défaut', () => {
    const content = 'DUPONT;Jean';
    const result = parseSimpleTXTFile(content);
    expect(result.fencers[0].gender).toBe(Gender.MIXED);
  });

  it('lastName toujours en majuscules', () => {
    const content = 'dupont;Jean';
    const result = parseSimpleTXTFile(content);
    expect(result.fencers[0].lastName).toBe('DUPONT');
  });

  it('status NOT_CHECKED_IN par défaut', () => {
    const content = 'DUPONT;Jean';
    const result = parseSimpleTXTFile(content);
    expect(result.fencers[0].status).toBe(FencerStatus.NOT_CHECKED_IN);
  });

  it('warning si aucun tireur trouvé', () => {
    const content = 'NOM;PRENOM';
    const result = parseSimpleTXTFile(content);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('nationalité FRA par défaut', () => {
    const content = 'DUPONT;Jean';
    const result = parseSimpleTXTFile(content);
    expect(result.fencers[0].nationality).toBe('FRA');
  });

  it('BOM UTF-8 supprimé correctement', () => {
    const bom = '﻿';
    const content = `${bom}DUPONT;Jean`;
    const result = parseSimpleTXTFile(content);
    expect(result.success).toBe(true);
    expect(result.fencers[0].lastName).toBe('DUPONT');
  });
});

// ============================================================================
// parseFFEFile
// ============================================================================

describe('parseFFEFile', () => {
  it('fichier vide → success=false, erreur', () => {
    const result = parseFFEFile('');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('format standard NOM;PRENOM;SEXE;DATE;NATION;LIGUE;CLUB;LICENCE;CLASSEMENT', () => {
    const content = 'NOM;PRENOM;SEXE;DATE;NATION;LIGUE;CLUB;LICENCE;CLASSEMENT\nDUPONT;Jean;M;15/06/1990;FRA;IDF;CE VERSAILLES;123456;10';
    const result = parseFFEFile(content);
    expect(result.success).toBe(true);
    expect(result.fencers).toHaveLength(1);
    const f = result.fencers[0];
    expect(f.lastName).toBe('DUPONT');
    expect(f.firstName).toBe('Jean');
    expect(f.gender).toBe(Gender.MALE);
    expect(f.nationality).toBe('FRA');
  });

  it('BOM UTF-8 supprimé', () => {
    const bom = '﻿';
    const content = `${bom}NOM;PRENOM;SEXE;DATE;NATION;LIGUE;CLUB;LICENCE;CLASSEMENT\nDUPONT;Jean;M;01/01/2000;FRA;;;123;5`;
    const result = parseFFEFile(content);
    expect(result.success).toBe(true);
    expect(result.fencers[0].lastName).toBe('DUPONT');
  });

  it('ligne malformée (moins de 2 champs) ignorée avec warning', () => {
    const content = 'NOM;PRENOM\nDUPONT\nMARTIN;Sophie;F;01/01/1995;FRA;;;456;3';
    const result = parseFFEFile(content);
    expect(result.fencers).toHaveLength(1);
    expect(result.fencers[0].lastName).toBe('MARTIN');
  });

  it('gender F détecté', () => {
    const content = 'NOM;PRENOM;SEXE\nMARTIN;Sophie;F;;;';
    const result = parseFFEFile(content);
    if (result.fencers.length > 0) {
      expect(result.fencers[0].gender).toBe(Gender.FEMALE);
    }
  });

  it('gender M détecté', () => {
    const content = 'NOM;PRENOM;SEXE\nDUPONT;Jean;M;;;';
    const result = parseFFEFile(content);
    if (result.fencers.length > 0) {
      expect(result.fencers[0].gender).toBe(Gender.MALE);
    }
  });

  it('tireur complet avec toutes les colonnes', () => {
    const content = [
      'NOM;PRENOM;SEXE;DATE;NATION;LIGUE;CLUB;LICENCE;CLASSEMENT',
      'LEFEBVRE;Claire;F;20/03/1998;FRA;OCCITANIE;MONTPELLIER ESCRIME;789012;7',
    ].join('\n');
    const result = parseFFEFile(content);
    expect(result.success).toBe(true);
    const f = result.fencers[0];
    expect(f.lastName).toBe('LEFEBVRE');
    expect(f.firstName).toBe('Claire');
    expect(f.gender).toBe(Gender.FEMALE);
  });

  it('plusieurs tireurs', () => {
    const content = [
      'NOM;PRENOM;SEXE;DATE;NATION;LIGUE;CLUB;LICENCE;CLASSEMENT',
      'DUPONT;Jean;M;01/01/1990;FRA;;;111;1',
      'MARTIN;Alice;F;02/02/1992;FRA;;;222;2',
      'BERNARD;Paul;M;03/03/1994;FRA;;;333;3',
    ].join('\n');
    const result = parseFFEFile(content);
    expect(result.success).toBe(true);
    expect(result.fencers).toHaveLength(3);
  });

  it('status NOT_CHECKED_IN par défaut', () => {
    const content = 'NOM;PRENOM;SEXE;DATE;NATION;LIGUE;CLUB;LICENCE;CLASSEMENT\nDUPONT;Jean;M;01/01/1990;FRA;;;111;1';
    const result = parseFFEFile(content);
    expect(result.fencers[0].status).toBe(FencerStatus.NOT_CHECKED_IN);
  });

  it('lastName toujours en majuscules', () => {
    const content = 'NOM;PRENOM;SEXE\ndupont;Jean;M;;;';
    const result = parseFFEFile(content);
    if (result.fencers.length > 0) {
      expect(result.fencers[0].lastName).toBe('DUPONT');
    }
  });
});

// ============================================================================
// parseXMLFile
// ============================================================================

describe('parseXMLFile', () => {
  it('XML vide → success=false', () => {
    const result = parseXMLFile('');
    expect(result.success).toBe(false);
    expect(result.fencers).toHaveLength(0);
  });

  it('XML sans balises Tireur → success=false', () => {
    const xml = '<?xml version="1.0"?><Competition Titre="Test"></Competition>';
    const result = parseXMLFile(xml);
    expect(result.success).toBe(false);
  });

  it('un tireur complet', () => {
    const xml = `<Competition><Tireur Nom="DUPONT" Prenom="Jean" Sexe="M" Nation="FRA" Ligue="IDF" Club="CE PARIS" Licence="123456" Classement="5"/></Competition>`;
    const result = parseXMLFile(xml);
    expect(result.success).toBe(true);
    expect(result.fencers).toHaveLength(1);
    const f = result.fencers[0];
    expect(f.lastName).toBe('DUPONT');
    expect(f.firstName).toBe('Jean');
    expect(f.gender).toBe(Gender.MALE);
    expect(f.nationality).toBe('FRA');
    expect(f.club).toBe('CE PARIS');
    expect(f.license).toBe('123456');
    expect(f.ranking).toBe(5);
  });

  it('tireur féminin détecté', () => {
    const xml = `<Competition><Tireur Nom="MARTIN" Prenom="Sophie" Sexe="F" Nation="FRA"/></Competition>`;
    const result = parseXMLFile(xml);
    expect(result.fencers[0].gender).toBe(Gender.FEMALE);
  });

  it('plusieurs tireurs', () => {
    const xml = [
      '<Competition>',
      '<Tireur Nom="DUPONT" Prenom="Jean" Sexe="M" Nation="FRA"/>',
      '<Tireur Nom="MARTIN" Prenom="Alice" Sexe="F" Nation="FRA"/>',
      '<Tireur Nom="BERNARD" Prenom="Paul" Sexe="M" Nation="FRA"/>',
      '</Competition>',
    ].join('');
    const result = parseXMLFile(xml);
    expect(result.success).toBe(true);
    expect(result.fencers).toHaveLength(3);
  });

  it('tireur sans Nom ou Prenom ignoré', () => {
    const xml = `<Competition><Tireur Nom="" Prenom="Jean" Sexe="M"/><Tireur Nom="MARTIN" Prenom="Alice" Sexe="F" Nation="FRA"/></Competition>`;
    const result = parseXMLFile(xml);
    expect(result.fencers).toHaveLength(1);
    expect(result.fencers[0].lastName).toBe('MARTIN');
  });

  it('status NOT_CHECKED_IN par défaut', () => {
    const xml = `<Competition><Tireur Nom="DUPONT" Prenom="Jean" Sexe="M" Nation="FRA"/></Competition>`;
    const result = parseXMLFile(xml);
    expect(result.fencers[0].status).toBe(FencerStatus.NOT_CHECKED_IN);
  });

  it('nation FRA par défaut si absente', () => {
    const xml = `<Competition><Tireur Nom="DUPONT" Prenom="Jean" Sexe="M"/></Competition>`;
    const result = parseXMLFile(xml);
    expect(result.fencers[0].nationality).toBe('FRA');
  });
});

// ============================================================================
// Issue #906 — aller-retour export/import .fff
// ============================================================================

describe('issue #906 — import .fff', () => {
  const mk = (lastName: string, firstName: string, extra: Partial<Fencer> = {}): Fencer =>
    ({
      id: 'x',
      ref: 1,
      lastName,
      firstName,
      gender: Gender.MIXED,
      nationality: '',
      status: FencerStatus.NOT_CHECKED_IN,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...extra,
    }) as Fencer;

  it('aller-retour avec seulement nom/prénom', () => {
    const out = exportFencersToFFF([mk('Dupont', 'Jean'), mk('Martin', 'Paul')]);
    const result = parseFFEFile(out);
    expect(result.fencers.map(f => f.lastName)).toEqual(['DUPONT', 'MARTIN']);
  });

  it('nom contenant « nom » / « x » (pas pris pour un en-tête)', () => {
    const out = exportFencersToFFF([mk('Nomade', 'Alexandre')]);
    const result = parseFFEFile(out);
    expect(result.fencers).toHaveLength(1);
    expect(result.fencers[0].lastName).toBe('NOMADE');
    expect(result.fencers[0].firstName).toBe('Alexandre');
  });

  it('fichier sans en-tête : premier tireur conservé', () => {
    const content =
      'ALEXANDRE,Max,01/01/2000,M,FRA;,,;1,IDF,CE X,3,,;1,t\nDUPONT,Jean,01/01/2000,M,FRA;,,;2,IDF,CE Y,4,,;2,t';
    expect(parseFFEFile(content).fencers).toHaveLength(2);
  });

  it('club contenant une virgule : champs non décalés', () => {
    const out = exportFencersToFFF([mk('Dupont', 'Jean', { club: 'Cercle, Paris', license: '42' })]);
    const f = parseFFEFile(out).fencers[0];
    expect(f.club).toBe('Cercle Paris');
    expect(f.license).toBe('42');
  });

  it('fichier FFE réel (Windows-1252, lignes de métadonnées)', () => {
    const text =
      'FFF;WIN;competition;;individuel\n28/09/2026;S;Seniors;;\nHÉLÈNE,Zoé,02/03/1995,F,FRA;,,;123456,ILE DE FRANCE,CE PARIS,12,t\n';
    const bytes = Uint8Array.from([...text].map(c => c.charCodeAt(0)));
    const content = decodeTextFile(bytes);
    const result = parseFFEFile(content);
    expect(result.fencers).toHaveLength(1);
    expect(result.fencers[0].lastName).toBe('HÉLÈNE');
    expect(result.fencers[0].firstName).toBe('Zoé');
    expect(result.fencers[0].license).toBe('123456');
  });

  it('decodeTextFile garde l’UTF-8 valide', () => {
    expect(decodeTextFile(new TextEncoder().encode('Zoé'))).toBe('Zoé');
  });

  it('.fff ouvert via « Importer XML » → parseur FFE', () => {
    const out = exportFencersToFFF([mk('Dupont', 'Jean')]);
    expect(resolveFencerFileFormat('xml', out)).toBe('fff');
    expect(resolveFencerFileFormat('txt', out)).toBe('fff');
    expect(resolveFencerFileFormat('fff', '<Competition/>')).toBe('xml');
    expect(resolveFencerFileFormat('txt', 'DUPONT Jean')).toBe('txt');
    expect(resolveFencerFileFormat('ranking', out)).toBe('ranking');
  });
});

describe('issue #906 — lignes .fff avec champs omis', () => {
  const header = 'FFF;UTF8;competition;;individuel\n';

  it.each([
    'DUPONT,Jean,,,FRA;;;',
    'DUPONT,Jean,,,FRA;,,;,,,;1,t',
    'DUPONT,Jean,,,',
    'DUPONT,Jean',
    'DUPONT,Jean;,,;;1,t',
  ])('tireur conservé : %s', line => {
    const result = parseFFEFile(header + line);
    expect(result.fencers).toHaveLength(1);
    expect(result.fencers[0].lastName).toBe('DUPONT');
    expect(result.fencers[0].firstName).toBe('Jean');
  });

  it('section personnelle incomplète : club et licence non décalés', () => {
    const result = parseFFEFile(header + 'DUPONT,Jean,,M;,,;123,IDF,CE Paris,5,,;1,t');
    expect(result.fencers[0]).toMatchObject({
      lastName: 'DUPONT',
      firstName: 'Jean',
      gender: Gender.MALE,
      license: '123',
      region: 'IDF',
      club: 'CE Paris',
      ranking: 5,
    });
  });
});
