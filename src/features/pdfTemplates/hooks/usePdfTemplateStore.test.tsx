// @vitest-environment jsdom
/**
 * Tests unitaires - usePdfTemplateStore
 * BellePoule Modern
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePdfTemplateStore } from './usePdfTemplateStore';
import type { PdfTemplate } from '../../../shared/types/pdfTemplate.types';

const get = () => usePdfTemplateStore.getState();

beforeEach(() => {
  // restaure les modèles par défaut
  get().resetTemplate('pool');
  get().resetTemplate('tableau');
  get().resetTemplate('ranking');
});

const custom = (docType: PdfTemplate['docType']): PdfTemplate =>
  ({
    docType,
    customTitle: 'PERSO',
    elements: [],
    colors: {},
    fonts: {},
  }) as unknown as PdfTemplate;

describe('usePdfTemplateStore', () => {
  it('fournit des modèles par défaut pour les 3 types', () => {
    expect(get().templates.pool.docType).toBe('pool');
    expect(get().templates.tableau.docType).toBe('tableau');
    expect(get().templates.ranking.docType).toBe('ranking');
    expect(get().templates.pool.elements.length).toBeGreaterThan(0);
  });

  it('setTemplate remplace le modèle d’un type', () => {
    get().setTemplate('pool', custom('pool'));
    expect(get().templates.pool.customTitle).toBe('PERSO');
    // les autres types restent inchangés
    expect(get().templates.tableau.customTitle).not.toBe('PERSO');
  });

  it('resetTemplate restaure le modèle par défaut', () => {
    get().setTemplate('ranking', custom('ranking'));
    expect(get().templates.ranking.elements).toHaveLength(0);
    get().resetTemplate('ranking');
    expect(get().templates.ranking.elements.length).toBeGreaterThan(0);
  });

  it('importTemplate cible le bon type via docType', () => {
    get().importTemplate(custom('tableau'));
    expect(get().templates.tableau.customTitle).toBe('PERSO');
    expect(get().templates.pool.customTitle).not.toBe('PERSO');
  });

  it('resetTemplate restaure indépendamment pool et tableau', () => {
    get().setTemplate('pool', custom('pool'));
    get().setTemplate('tableau', custom('tableau'));

    get().resetTemplate('pool');
    expect(get().templates.pool.elements.length).toBeGreaterThan(0);
    // tableau reste altéré tant qu'il n'est pas réinitialisé lui aussi
    expect(get().templates.tableau.elements).toHaveLength(0);

    get().resetTemplate('tableau');
    expect(get().templates.tableau.elements.length).toBeGreaterThan(0);
  });

  it("setTemplate n'affecte que le type ciblé, les deux autres restent par défaut", () => {
    const before = {
      tableau: get().templates.tableau,
      ranking: get().templates.ranking,
    };
    get().setTemplate('pool', custom('pool'));
    expect(get().templates.tableau).toBe(before.tableau);
    expect(get().templates.ranking).toBe(before.ranking);
  });
});
