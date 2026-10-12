/**
 * Tests unitaires - Modèles de tournoi (templates)
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import {
  OFFICIAL_TEMPLATES,
  getOfficialTemplates,
  getTemplateById,
  applyTemplate,
} from './tournamentTemplates';

describe('OFFICIAL_TEMPLATES', () => {
  it('contient au moins un modèle officiel', () => {
    expect(OFFICIAL_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('a des ids uniques', () => {
    const ids = OFFICIAL_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('expose une catégorie valide pour chaque modèle', () => {
    expect(
      OFFICIAL_TEMPLATES.every(t => t.category === 'official' || t.category === 'custom')
    ).toBe(true);
  });

  it('getOfficialTemplates retourne la même liste', () => {
    expect(getOfficialTemplates()).toEqual(OFFICIAL_TEMPLATES);
  });
});

describe('getTemplateById', () => {
  it('retrouve un modèle officiel existant', () => {
    const first = OFFICIAL_TEMPLATES[0];
    expect(getTemplateById(first.id)).toEqual(first);
  });

  it('retourne null pour un id inconnu', () => {
    expect(getTemplateById('id-inexistant')).toBeNull();
  });
});

describe('applyTemplate', () => {
  it('reporte arme, genre, catégorie, couleur et settings', () => {
    const tpl = OFFICIAL_TEMPLATES[0];
    const result = applyTemplate(tpl);
    expect(result.weapon).toBe(tpl.weapon);
    expect(result.gender).toBe(tpl.gender);
    expect(result.category).toBe(tpl.category_age);
    expect(result.color).toBe(tpl.color);
    expect(result.settings).toEqual(tpl.settings);
  });

  it('utilise le nom du modèle comme titre par défaut', () => {
    const tpl = OFFICIAL_TEMPLATES[0];
    expect(applyTemplate(tpl).title).toBe(tpl.name);
  });

  it('utilise le titre fourni s’il est présent', () => {
    const tpl = OFFICIAL_TEMPLATES[0];
    expect(applyTemplate(tpl, 'Mon Tournoi').title).toBe('Mon Tournoi');
  });
});
