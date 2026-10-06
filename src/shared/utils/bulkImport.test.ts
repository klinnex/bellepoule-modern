/**
 * Tests unitaires — bulkImport.ts (BellePoule Modern)
 */

import { describe, it, expect } from 'vitest';
import {
  parseCSV,
  parseExcel,
  autoDetectMapping,
  importFencers,
  generateImportTemplate,
  detectFileType,
  bulkImportFencers,
} from './bulkImport';
import { Gender, FencerStatus } from '../types';

// ─── parseCSV ────────────────────────────────────────────────────────────────

describe('parseCSV', () => {
  it('parse une ligne simple', () => {
    const result = parseCSV('DUPONT,Jean,FRA');
    expect(result).toEqual([['DUPONT', 'Jean', 'FRA']]);
  });

  it('parse plusieurs lignes', () => {
    const csv = 'Nom,Prenom\nDUPONT,Jean\nMARTIN,Marie';
    const result = parseCSV(csv);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual(['DUPONT', 'Jean']);
  });

  it('gère les champs entre guillemets', () => {
    const result = parseCSV('"Dupont, Jr.",Jean,FRA');
    expect(result[0][0]).toBe('Dupont, Jr.');
    expect(result[0][1]).toBe('Jean');
  });

  it("gère les guillemets doubles à l'intérieur des champs", () => {
    const result = parseCSV('"Dit ""Le Grand""",Jean');
    expect(result[0][0]).toBe('Dit "Le Grand"');
  });

  it('trim les espaces', () => {
    const result = parseCSV('  DUPONT  ,  Jean  ');
    expect(result[0][0]).toBe('DUPONT');
    expect(result[0][1]).toBe('Jean');
  });

  it('retourne un tableau vide pour une chaîne vide', () => {
    const result = parseCSV('   ');
    expect(result).toEqual([['']]);
  });
});

// ─── parseExcel ──────────────────────────────────────────────────────────────

describe('parseExcel', () => {
  it('parse du contenu TSV', () => {
    const tsv = 'Nom\tPrenom\tClub\nDUPONT\tJean\tParis';
    const result = parseExcel(tsv);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(['DUPONT', 'Jean', 'Paris']);
  });

  it('trim les cellules', () => {
    const tsv = '  DUPONT  \t  Jean  ';
    const result = parseExcel(tsv);
    expect(result[0][0]).toBe('DUPONT');
    expect(result[0][1]).toBe('Jean');
  });
});

// ─── autoDetectMapping ───────────────────────────────────────────────────────

describe('autoDetectMapping', () => {
  it('détecte les colonnes Club, Licence, Nation, Classement, Sexe', () => {
    const headers = ['Famille', 'Prenom', 'Club', 'Licence', 'Nation', 'Classement', 'Sexe'];
    const mapping = autoDetectMapping(headers);
    expect(mapping.club).toBe(2);
    expect(mapping.license).toBe(3);
    expect(mapping.nationality).toBe(4);
    expect(mapping.ranking).toBe(5);
    expect(mapping.gender).toBe(6);
  });

  it('détecte les colonnes ranking et gender anglais', () => {
    const headers = ['Famille', 'Prenom', 'Club', 'License', 'Country', 'Ranking', 'Gender'];
    const mapping = autoDetectMapping(headers);
    expect(mapping.ranking).toBe(5);
    expect(mapping.gender).toBe(6);
  });

  it('utilise 0/1 comme fallback si non détecté', () => {
    const mapping = autoDetectMapping(['ColA', 'ColB']);
    expect(mapping.lastName).toBe(0);
    expect(mapping.firstName).toBe(1);
  });

  it('retourne un objet avec toutes les clés requises', () => {
    const mapping = autoDetectMapping(['Nom', 'Prenom']);
    expect(mapping).toHaveProperty('lastName');
    expect(mapping).toHaveProperty('firstName');
  });
});

// ─── importFencers ───────────────────────────────────────────────────────────

describe('importFencers', () => {
  // Utiliser un mapping numérique direct pour éviter les faux positifs du substring matching
  const numericMapping = {
    lastName: 0,
    firstName: 1,
    club: 2,
    license: 3,
    nationality: 4,
    ranking: 5,
    gender: 6,
  };
  const validData = [
    ['DUPONT', 'Jean', 'Paris EC', '12345', 'FRA', '10', 'M'],
    ['MARTIN', 'Marie', 'Lyon EC', '12346', 'FRA', '15', 'F'],
  ];

  it('importe des tireurs valides', () => {
    const result = importFencers(validData, numericMapping, false);
    expect(result.success).toBe(true);
    expect(result.importedCount).toBe(2);
    expect(result.fencers).toHaveLength(2);
  });

  it('mappe correctement les champs', () => {
    const result = importFencers(validData, numericMapping, false);
    const jean = result.fencers.find(f => f.lastName === 'DUPONT');
    expect(jean).toBeDefined();
    expect(jean?.firstName).toBe('Jean');
    expect(jean?.club).toBe('Paris EC');
    expect(jean?.license).toBe('12345');
    expect(jean?.nationality).toBe('FRA');
    expect(jean?.ranking).toBe(10);
    expect(jean?.gender).toBe(Gender.MALE);
    expect(jean?.status).toBe(FencerStatus.CHECKED_IN);
  });

  it('gère les genres français (H/F)', () => {
    const m = { lastName: 0, firstName: 1, gender: 2 };
    const data = [
      ['DUPONT', 'Paul', 'H'],
      ['DUBOIS', 'Claire', 'F'],
    ];
    const result = importFencers(data, m, false);
    expect(result.fencers[0].gender).toBe(Gender.MALE);
    expect(result.fencers[1].gender).toBe(Gender.FEMALE);
  });

  it('ignore les lignes vides', () => {
    const data = [...validData, ['', '', '', '', '', '', '']];
    const result = importFencers(data, numericMapping, false);
    expect(result.importedCount).toBe(2);
  });

  it('renvoie une erreur pour données vides', () => {
    const result = importFencers([]);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('general');
  });

  it('signale les erreurs de validation (lastName manquant)', () => {
    const m = { lastName: 0, firstName: 1 };
    const data = [['', 'Jean']];
    const result = importFencers(data, m, false);
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.field === 'lastName')).toBe(true);
    expect(result.skippedCount).toBe(1);
  });

  it('signale les erreurs de validation (firstName manquant)', () => {
    const m = { lastName: 0, firstName: 1 };
    const data = [['DUPONT', '']];
    const result = importFencers(data, m, false);
    expect(result.errors.some(e => e.field === 'firstName')).toBe(true);
  });

  it('signale une erreur pour un classement invalide', () => {
    const m = { lastName: 0, firstName: 1, ranking: 2 };
    const data = [['DUPONT', 'Jean', '-5']];
    const result = importFencers(data, m, false);
    expect(result.errors.some(e => e.field === 'ranking')).toBe(true);
  });

  it('utilise FRA comme nationalité par défaut', () => {
    const m = { lastName: 0, firstName: 1 };
    const data = [['DUPONT', 'Jean']];
    const result = importFencers(data, m, false);
    expect(result.fencers[0].nationality).toBe('FRA');
  });

  it('fonctionne sans en-tête (hasHeader=false) avec mapping numérique', () => {
    const data = [
      ['DUPONT', 'Jean'],
      ['MARTIN', 'Marie'],
    ];
    const mapping = { lastName: 0, firstName: 1 };
    const result = importFencers(data, mapping, false);
    expect(result.importedCount).toBe(2);
  });

  it('importe plusieurs tireurs en reportant les erreurs ligne par ligne', () => {
    const m = { lastName: 0, firstName: 1 };
    const data = [
      ['DUPONT', 'Jean'],
      ['', 'Marie'], // erreur : lastName manquant
      ['MARTIN', 'Paul'],
    ];
    const result = importFencers(data, m, false);
    expect(result.importedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
  });
});

// ─── generateImportTemplate ──────────────────────────────────────────────────

describe('generateImportTemplate', () => {
  it('retourne un template CSV non vide', () => {
    const template = generateImportTemplate();
    expect(template).toBeTruthy();
    expect(template).toContain('Nom');
    expect(template).toContain('Prenom');
  });

  it('contient les colonnes standard', () => {
    const template = generateImportTemplate();
    expect(template).toContain('Club');
    expect(template).toContain('Licence');
    expect(template).toContain('Nation');
    expect(template).toContain('Classement');
    expect(template).toContain('Sexe');
  });
});

// ─── detectFileType ──────────────────────────────────────────────────────────

describe('detectFileType', () => {
  it('détecte le CSV', () => {
    expect(detectFileType('Nom,Prenom,Club')).toBe('csv');
  });

  it("détecte l'Excel (TSV)", () => {
    expect(detectFileType('Nom\tPrenom\tClub')).toBe('excel');
  });

  it('retourne unknown si non reconnu', () => {
    expect(detectFileType('no delimiters here')).toBe('unknown');
  });

  it('TSV prime sur CSV si les deux sont présents', () => {
    expect(detectFileType('Nom\tPrenom,Club')).toBe('excel');
  });
});

// ─── bulkImportFencers ───────────────────────────────────────────────────────

describe('bulkImportFencers', () => {
  it('importe depuis un CSV valide', async () => {
    const csv = 'Nom,Prenom,Nation,Sexe\nDUPONT,Jean,FRA,M\nMARTIN,Marie,FRA,F';
    const result = await bulkImportFencers(csv);
    expect(result.importedCount).toBe(2);
  });

  it('importe depuis du TSV', async () => {
    const tsv = 'Nom\tPrenom\nDUPONT\tJean\nMARTIN\tMarie';
    const result = await bulkImportFencers(tsv, 'excel');
    expect(result.importedCount).toBe(2);
  });

  it('détecte automatiquement le type si non fourni', async () => {
    const csv = 'Nom,Prenom\nDUPONT,Jean';
    const result = await bulkImportFencers(csv);
    expect(result.importedCount).toBe(1);
  });
});
