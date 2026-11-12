/**
 * BellePoule Modern - Thèmes prédéfinis du sélecteur « Thème global »
 * Liste jamais vide même sans thème sauvegardé : piste → Sombre/Clair/Néon,
 * autres écrans → valeurs par défaut de l'éditeur ; Steampunk pour tous.
 * Licensed under GPL-3.0
 */
import type { CustomTheme, DisplayTheme, ThemeTargetType } from '../../../shared/types/remote';
import {
  DARK_DEFAULTS,
  KIOSK_DEFAULTS,
  POOL_DEFAULTS,
  PUBLIC_DEFAULTS,
  REFEREE_DEFAULTS,
} from '../ThemeEditor';

export const BUILTIN_THEME_PREFIX = 'builtin:';

const ARENA_PRESETS = ['dark', 'light', 'neon'] as const;

const SECTION_DEFAULTS: Record<ThemeTargetType, Record<string, string>> = {
  arena: DARK_DEFAULTS,
  kiosk: KIOSK_DEFAULTS,
  public: PUBLIC_DEFAULTS,
  referee: REFEREE_DEFAULTS,
  pool: POOL_DEFAULTS,
};

/**
 * Steampunk : acajou et laiton, parchemin, rivets cuivrés, tubes Nixie orangés.
 * Côté vert = vert-de-gris, côté rouge = sang-de-bœuf (contraste conservé pour les scores).
 */
const STEAMPUNK: Record<ThemeTargetType, Record<string, string>> = {
  arena: {
    '--bg': 'radial-gradient(ellipse at 50% 30%, #4a2c17 0%, #2b170b 60%, #160b04 100%)',
    '--text': '#f3e2b8',
    '--header-bg': 'linear-gradient(180deg, #8a6a2f 0%, #5c4320 100%)',
    '--match-bg': 'linear-gradient(180deg, #f4e6c4 0%, #e6d2a1 100%)',
    '--fencer-name-color': '#3b2210',
    '--fencer-club-color': '#7a5a32',
    '--green-side-bg': 'linear-gradient(135deg, #e9efd9 0%, #cfdcb8 100%)',
    '--green-side-border': '#3f8f6f',
    '--red-side-bg': 'linear-gradient(135deg, #f3dcc8 0%, #e7bfa1 100%)',
    '--red-side-border': '#8b2a1a',
    '--score-bg': '#1a0f06',
    '--score-green': '#7fe0b0',
    '--score-green-glow': 'rgba(127,224,176,0.65), rgba(63,143,111,0.35)',
    '--score-red': '#ff7a3d',
    '--score-red-glow': 'rgba(255,122,61,0.7), rgba(180,60,20,0.35)',
    '--timer-bg': '#120a03',
    '--timer-color': '#ff9b2f',
    '--timer-glow': 'rgba(255,155,47,0.95), rgba(255,110,20,0.5)',
    '--timer-border': '#b5893b',
    '--timer-run-color': '#ffc46b',
    '--timer-run-glow': 'rgba(255,196,107,0.95), rgba(255,140,30,0.55)',
    '--timer-run-border': '#d4a64a',
    '--waiting-color': '#f3e2b8',
    '--idle-number-color': 'rgba(243,226,184,0.9)',
    '--idle-label-color': 'rgba(212,166,74,0.7)',
    '--score-font-family': '"Courier New", monospace',
    '--timer-font-family': '"Courier New", monospace',
    '--fencer-name-font-family': 'Georgia, serif',
    '--vs-color': '#d4a64a',
    '--vs-font-family': 'Georgia, serif',
  },
  kiosk: {
    '--k-bg': 'radial-gradient(ellipse at top, #3d2412 0%, #1c0f06 100%)',
    '--k-accent': '#d4a64a',
    '--k-accent2': '#b87333',
    '--k-card-bg': 'rgba(212, 166, 74, 0.08)',
    '--k-border': 'rgba(181, 137, 59, 0.45)',
    '--k-muted': '#a88a5c',
    '--k-progress': 'linear-gradient(90deg, #b87333, #d4a64a, #3f8f6f)',
  },
  public: {
    '--pub-bg': 'radial-gradient(ellipse at top, #4a2c17 0%, #1c0f06 100%)',
    '--pub-header-bg': 'linear-gradient(180deg, #8a6a2f 0%, #5c4320 100%)',
    '--pub-accent': '#d4a64a',
    '--pub-accent2': '#3f8f6f',
    '--pub-text': '#f3e2b8',
    '--pub-muted': 'rgba(243,226,184,0.6)',
    '--pub-card-bg': 'rgba(212, 166, 74, 0.08)',
    '--pub-border': 'rgba(181, 137, 59, 0.45)',
  },
  referee: {
    '--ref-bg': 'linear-gradient(160deg, #3d2412 0%, #1c0f06 100%)',
    '--ref-header-bg': 'linear-gradient(180deg, #8a6a2f 0%, #5c4320 100%)',
    '--ref-accent': '#d4a64a',
    '--ref-accent2': '#b87333',
    '--ref-text': '#f3e2b8',
    '--ref-muted': 'rgba(243,226,184,0.6)',
    '--ref-card-bg': 'rgba(212, 166, 74, 0.08)',
    '--ref-border': 'rgba(181, 137, 59, 0.45)',
  },
  pool: {
    '--pool-bg': '#24140a',
    '--pool-header-bg': 'linear-gradient(180deg, #8a6a2f 0%, #5c4320 100%)',
    '--pool-accent': '#d4a64a',
    '--pool-accent2': '#b87333',
    '--pool-text': '#f3e2b8',
    '--pool-muted': '#a88a5c',
    '--pool-card-bg': 'rgba(212, 166, 74, 0.07)',
    '--pool-border': 'rgba(181, 137, 59, 0.4)',
  },
};

type Translate = (key: string) => string;

/** Options prédéfinies affichées pour une section */
export function getBuiltinThemeOptions(
  section: ThemeTargetType,
  t: Translate
): { id: string; label: string }[] {
  const steampunk = { id: `${BUILTIN_THEME_PREFIX}steampunk`, label: t('rsm.theme_steampunk') };
  if (section === 'arena') {
    return [
      ...ARENA_PRESETS.map(p => ({
        id: `${BUILTIN_THEME_PREFIX}${p}`,
        label: t(`rsm.theme_${p}`),
      })),
      steampunk,
    ];
  }
  return [{ id: `${BUILTIN_THEME_PREFIX}default`, label: t('rsm.theme_default') }, steampunk];
}

export function isBuiltinThemeId(id: string): boolean {
  return id.startsWith(BUILTIN_THEME_PREFIX);
}

/** Résout un id prédéfini : préréglage d'affichage piste ou thème custom aux valeurs par défaut */
export function resolveBuiltinTheme(
  section: ThemeTargetType,
  id: string,
  t: Translate
): { preset: DisplayTheme; theme?: undefined } | { preset?: undefined; theme: CustomTheme } | null {
  if (!isBuiltinThemeId(id)) return null;
  const key = id.slice(BUILTIN_THEME_PREFIX.length);
  if (key === 'steampunk') {
    return {
      theme: {
        id,
        name: t('rsm.theme_steampunk'),
        targetType: section,
        variables: { ...SECTION_DEFAULTS[section], ...STEAMPUNK[section] },
      },
    };
  }
  if (section === 'arena') {
    return (ARENA_PRESETS as readonly string[]).includes(key)
      ? { preset: key as DisplayTheme }
      : null;
  }
  if (key !== 'default') return null;
  return {
    theme: {
      id,
      name: t('rsm.theme_default'),
      targetType: section,
      variables: { ...SECTION_DEFAULTS[section] },
    },
  };
}
