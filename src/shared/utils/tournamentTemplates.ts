/**
 * BellePoule Modern - Tournament Templates
 * Predefined competition configurations
 * Licensed under GPL-3.0
 */

import {
  Competition,
  CustomFormulaConfig,
  Weapon,
  Gender,
  Category,
  CompetitionSettings,
  PoolPhaseConfig,
} from '../types';

export interface TournamentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'official' | 'custom';
  weapon: Weapon;
  gender: Gender;
  category_age: Category;
  settings: CompetitionSettings;
  poolConfig: PoolPhaseConfig;
  color: string;
}

// ============================================================================
// Official FFE Templates
// ============================================================================

export const OFFICIAL_TEMPLATES: TournamentTemplate[] = [
  {
    id: 'ffe-senior-individual',
    name: 'Championnat Individuel Senior FFE',
    description: 'Format officiel FFE - Poules de 7, tableau à 64',
    category: 'official',
    weapon: Weapon.EPEE,
    gender: Gender.MIXED,
    category_age: Category.SENIOR,
    color: '#1e40af',
    settings: {
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 21,
      poolRounds: 1,
      hasDirectElimination: true,
      thirdPlaceMatch: true,
      manualRanking: false,
      defaultRanking: 0,
      randomScore: false,
      minTeamSize: 3,
      defaultPoolTimerSeconds: 180,
      defaultTableTimerSeconds: 180,
    },
    poolConfig: {
      minPoolSize: 5,
      maxPoolSize: 7,
      balanced: true,
      seeding: 'serpentine',
      separation: {
        byClub: true,
        byRegion: true,
        byNation: false,
      },
    },
  },
  {
    id: 'ffe-cadet-individual',
    name: 'Championnat Individuel M17 FFE',
    description: 'Format officiel FFE M17 - Poules de 6, tableau à 64',
    category: 'official',
    weapon: Weapon.EPEE,
    gender: Gender.MIXED,
    category_age: Category.U17,
    color: '#0891b2',
    settings: {
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 21,
      poolRounds: 1,
      hasDirectElimination: true,
      thirdPlaceMatch: true,
      manualRanking: false,
      defaultRanking: 0,
      randomScore: false,
      minTeamSize: 3,
      defaultPoolTimerSeconds: 180,
      defaultTableTimerSeconds: 180,
    },
    poolConfig: {
      minPoolSize: 5,
      maxPoolSize: 6,
      balanced: true,
      seeding: 'serpentine',
      separation: {
        byClub: true,
        byRegion: true,
        byNation: false,
      },
    },
  },
  {
    id: 'ffe-minime-individual',
    name: 'Championnat Individuel M15 FFE',
    description: 'Format officiel FFE M15 - Poules de 5, tableau à 32',
    category: 'official',
    weapon: Weapon.EPEE,
    gender: Gender.MIXED,
    category_age: Category.U15,
    color: '#059669',
    settings: {
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 10,
      poolRounds: 1,
      hasDirectElimination: true,
      thirdPlaceMatch: true,
      manualRanking: false,
      defaultRanking: 0,
      randomScore: false,
      minTeamSize: 3,
      defaultPoolTimerSeconds: 180,
      defaultTableTimerSeconds: 180,
    },
    poolConfig: {
      minPoolSize: 4,
      maxPoolSize: 5,
      balanced: true,
      seeding: 'serpentine',
      separation: {
        byClub: true,
        byRegion: true,
        byNation: false,
      },
    },
  },
  {
    id: 'ffe-veteran-individual',
    name: 'Championnat Individuel Vétéran FFE',
    description: 'Format officiel FFE Vétérans - Poules de 6, tableau à 32',
    category: 'official',
    weapon: Weapon.EPEE,
    gender: Gender.MIXED,
    category_age: Category.V1,
    color: '#7c3aed',
    settings: {
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 10,
      poolRounds: 1,
      hasDirectElimination: true,
      thirdPlaceMatch: true,
      manualRanking: false,
      defaultRanking: 0,
      randomScore: false,
      minTeamSize: 3,
      defaultPoolTimerSeconds: 180,
      defaultTableTimerSeconds: 180,
    },
    poolConfig: {
      minPoolSize: 5,
      maxPoolSize: 6,
      balanced: true,
      seeding: 'serpentine',
      separation: {
        byClub: false,
        byRegion: false,
        byNation: false,
      },
    },
  },
  {
    id: 'competition-poules-only',
    name: 'Compétition Poules Uniquement',
    description: 'Phase de poules uniquement, pas de tableau',
    category: 'custom',
    weapon: Weapon.FOIL,
    gender: Gender.MIXED,
    category_age: Category.SENIOR,
    color: '#dc2626',
    settings: {
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 21,
      poolRounds: 1,
      hasDirectElimination: false,
      thirdPlaceMatch: false,
      manualRanking: false,
      defaultRanking: 0,
      randomScore: false,
      minTeamSize: 3,
      defaultPoolTimerSeconds: 180,
      defaultTableTimerSeconds: 180,
    },
    poolConfig: {
      minPoolSize: 5,
      maxPoolSize: 7,
      balanced: true,
      seeding: 'serpentine',
      separation: {
        byClub: true,
        byRegion: false,
        byNation: false,
      },
    },
  },
];

// ============================================================================
// Template Management
// ============================================================================

const STORAGE_KEY = 'bellepoule-templates';

/**
 * Get all templates (official + custom)
 */
export function getAllTemplates(): TournamentTemplate[] {
  const customTemplates = getCustomTemplates();
  return [...OFFICIAL_TEMPLATES, ...customTemplates];
}

/**
 * Get official templates only
 */
export function getOfficialTemplates(): TournamentTemplate[] {
  return OFFICIAL_TEMPLATES;
}

/**
 * Get custom templates from localStorage
 */
export function getCustomTemplates(): TournamentTemplate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load custom templates:', error);
  }
  return [];
}

/**
 * Save custom template
 */
export function saveCustomTemplate(template: TournamentTemplate): boolean {
  try {
    const templates = getCustomTemplates();

    // Check for duplicate ID
    const existingIndex = templates.findIndex(t => t.id === template.id);
    if (existingIndex >= 0) {
      templates[existingIndex] = template;
    } else {
      templates.push({
        ...template,
        id: `custom-${Date.now()}`,
        category: 'custom',
      });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    return true;
  } catch (error) {
    console.error('Failed to save custom template:', error);
    return false;
  }
}

/**
 * Delete custom template
 */
export function deleteCustomTemplate(templateId: string): boolean {
  try {
    const templates = getCustomTemplates();
    const filtered = templates.filter(t => t.id !== templateId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Failed to delete custom template:', error);
    return false;
  }
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): TournamentTemplate | null {
  return getAllTemplates().find(t => t.id === id) || null;
}

/**
 * Apply template to competition
 */
export function applyTemplate(template: TournamentTemplate, title?: string): Partial<Competition> {
  return {
    title: title || template.name,
    weapon: template.weapon,
    gender: template.gender,
    category: template.category_age,
    color: template.color,
    settings: template.settings,
  };
}

/**
 * Export templates to JSON
 */
export function exportTemplates(): string {
  return JSON.stringify(getAllTemplates(), null, 2);
}

/**
 * Import templates from JSON
 */
export function importTemplates(jsonContent: string): TournamentTemplate[] {
  try {
    const templates = JSON.parse(jsonContent) as TournamentTemplate[];
    // Filter out official templates
    const customTemplates = templates.filter(t => t.category === 'custom');

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customTemplates));

    return customTemplates;
  } catch (error) {
    console.error('Failed to import templates:', error);
    return [];
  }
}

/**
 * Create competition from template
 */
export function createCompetitionFromTemplate(
  templateId: string,
  customTitle?: string
): Partial<Competition> | null {
  const template = getTemplateById(templateId);
  if (!template) return null;

  return applyTemplate(template, customTitle);
}

// ============================================================================
// Custom Formula Template Management (Formule à la carte)
// ============================================================================

const FORMULA_STORAGE_KEY = 'bellepoule-formula-templates';

export interface FormulaTemplateEntry {
  name: string;
  formula: CustomFormulaConfig;
  savedAt: string;
}

/**
 * Formule par défaut : 1 tour de poules (top 80%) → DE → Classification
 */
export function createDefaultCustomFormula(): CustomFormulaConfig {
  return {
    version: 1,
    formulaName: 'Formule personnalisée',
    phases: [
      {
        id: `pool_round_${Date.now()}`,
        type: 'pool_round',
        label: 'Tour de poules',
        config: {
          roundIndex: 0,
          minPoolSize: 5,
          maxPoolSize: 8,
          balanced: true,
          seeding: 'serpentine',
          separation: { byClub: true, byRegion: false, byNation: false },
          maxScore: 5,
          timerSeconds: 180,
          scoring: { type: 'standard', maxScore: 5 },
          rankingCriteria: [
            { id: 'vm_ratio', direction: 'desc', enabled: true },
            { id: 'index', direction: 'desc', enabled: true },
            { id: 'direct_bout', direction: 'desc', enabled: true },
            { id: 'initial_ranking', direction: 'asc', enabled: true },
          ],
          advancementRule: { mode: 'percentage', percentage: 80 },
        },
      },
      {
        id: `de_${Date.now() + 1}`,
        type: 'direct_elimination',
        label: 'Élimination directe',
        config: {
          maxScore: 15,
          timerSeconds: 180,
          thirdPlaceMatch: true,
          placesToFence: [1, 3],
          scoring: { type: 'standard', maxScore: 15 },
        },
      },
      {
        id: `classification_${Date.now() + 2}`,
        type: 'classification',
        label: 'Classement final',
        config: {
          maxScore: 15,
          timerSeconds: 180,
          thirdPlaceMatch: false,
          placesToFence: [],
          scoring: { type: 'standard', maxScore: 15 },
        },
      },
    ],
  };
}

export function getCustomFormulaTemplates(): FormulaTemplateEntry[] {
  try {
    const stored = localStorage.getItem(FORMULA_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return [];
}

export function saveCustomFormulaTemplate(name: string, formula: CustomFormulaConfig): boolean {
  try {
    const templates = getCustomFormulaTemplates();
    const existing = templates.findIndex(t => t.name === name);
    const entry: FormulaTemplateEntry = { name, formula, savedAt: new Date().toISOString() };
    if (existing >= 0) templates[existing] = entry;
    else templates.push(entry);
    localStorage.setItem(FORMULA_STORAGE_KEY, JSON.stringify(templates));
    return true;
  } catch {
    return false;
  }
}

export function deleteCustomFormulaTemplate(name: string): boolean {
  try {
    const templates = getCustomFormulaTemplates().filter(t => t.name !== name);
    localStorage.setItem(FORMULA_STORAGE_KEY, JSON.stringify(templates));
    return true;
  } catch {
    return false;
  }
}

export function exportFormulaAsJSON(formula: CustomFormulaConfig): string {
  return JSON.stringify(formula, null, 2);
}

export function importFormulaFromJSON(json: string): CustomFormulaConfig | null {
  try {
    const parsed = JSON.parse(json) as CustomFormulaConfig;
    if (parsed.version !== 1 || !Array.isArray(parsed.phases)) return null;
    return parsed;
  } catch {
    return null;
  }
}
