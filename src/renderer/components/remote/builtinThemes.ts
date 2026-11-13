/**
 * BellePoule Modern - Thèmes prédéfinis du sélecteur « Thème global »
 * Liste jamais vide même sans thème sauvegardé : piste → Sombre/Clair/Néon,
 * autres écrans → valeurs par défaut de l'éditeur ; thèmes décoratifs
 * (Steampunk, Mousquetaires, Arcade 8-bit, Sumi-e) pour tous.
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

/** Section du sélecteur « Thème global » : un type d'écran, ou « Toutes sources » (#1795) */
export type GlobalThemeSection = ThemeTargetType | 'all';

/** Types d'écran couverts par « Toutes sources » */
export const THEME_SECTIONS: readonly ThemeTargetType[] = [
  'arena',
  'kiosk',
  'public',
  'referee',
  'pool',
];

const ARENA_PRESETS = ['dark', 'light', 'neon'] as const;

/** Paresseux : ThemeEditor importe ce module (import circulaire) */
function sectionDefaults(section: ThemeTargetType): Record<string, string> {
  const map: Record<ThemeTargetType, Record<string, string>> = {
    arena: DARK_DEFAULTS,
    kiosk: KIOSK_DEFAULTS,
    public: PUBLIC_DEFAULTS,
    referee: REFEREE_DEFAULTS,
    pool: POOL_DEFAULTS,
  };
  return map[section];
}

/** Variables des préréglages piste Clair/Néon (miroir de [data-theme] dans arena.html) */
const ARENA_PRESET_VARS: Record<'light' | 'neon', Record<string, string>> = {
  light: {
    '--bg': 'linear-gradient(135deg, #e8edf5 0%, #c8d8f0 100%)',
    '--text': '#1a2340',
    '--header-bg': 'rgba(255, 255, 255, 0.75)',
    '--match-bg': '#ffffff',
    '--fencer-name-color': '#111827',
    '--fencer-club-color': '#374151',
    '--green-side-bg': 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
    '--green-side-border': '#059669',
    '--red-side-bg': 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
    '--red-side-border': '#b91c1c',
    '--score-bg': '#f1f5f9',
    '--score-green': '#059669',
    '--score-green-glow': 'rgba(5, 150, 105, 0.4), rgba(5, 150, 105, 0.15)',
    '--score-red': '#dc2626',
    '--score-red-glow': 'rgba(220, 38, 38, 0.4), rgba(220, 38, 38, 0.15)',
    '--timer-bg': '#f8fafc',
    '--timer-color': '#d97706',
    '--timer-glow': 'rgba(217, 119, 6, 0.7), rgba(217, 119, 6, 0.3)',
    '--timer-border': 'rgba(217, 119, 6, 0.3)',
    '--timer-run-color': '#059669',
    '--timer-run-glow': 'rgba(5, 150, 105, 0.8), rgba(5, 150, 105, 0.35)',
    '--timer-run-border': 'rgba(5, 150, 105, 0.4)',
    '--waiting-color': '#1a2340',
    '--idle-number-color': 'rgba(26, 35, 64, 0.85)',
    '--idle-label-color': 'rgba(26, 35, 64, 0.45)',
    '--vs-color': '#dc2626',
    '--vs-font-family': 'system-ui, sans-serif',
  },
  neon: {
    '--bg': '#0a0a0a',
    '--text': '#e0e0e0',
    '--header-bg': 'rgba(0, 0, 0, 0.8)',
    '--match-bg': '#111111',
    '--fencer-name-color': '#f0f0f0',
    '--fencer-club-color': '#a0a0a0',
    '--green-side-bg': 'linear-gradient(135deg, #001a0d 0%, #002e15 100%)',
    '--green-side-border': '#00ff88',
    '--red-side-bg': 'linear-gradient(135deg, #1a0000 0%, #2e0000 100%)',
    '--red-side-border': '#ff2244',
    '--score-bg': '#050505',
    '--score-green': '#00ff88',
    '--score-green-glow': 'rgba(0, 255, 136, 0.9), rgba(0, 255, 136, 0.5)',
    '--score-red': '#ff2244',
    '--score-red-glow': 'rgba(255, 34, 68, 0.9), rgba(255, 34, 68, 0.5)',
    '--timer-bg': '#030303',
    '--timer-color': '#ff9900',
    '--timer-glow': 'rgba(255, 153, 0, 0.95), rgba(255, 153, 0, 0.5)',
    '--timer-border': 'rgba(255, 153, 0, 0.3)',
    '--timer-run-color': '#00ff88',
    '--timer-run-glow': 'rgba(0, 255, 136, 1), rgba(0, 255, 136, 0.6)',
    '--timer-run-border': 'rgba(0, 255, 136, 0.6)',
    '--waiting-color': '#e0e0e0',
    '--idle-number-color': 'rgba(255, 255, 255, 0.9)',
    '--idle-label-color': 'rgba(255, 255, 255, 0.35)',
    '--vs-color': '#ff2244',
    '--vs-font-family': 'system-ui, sans-serif',
  },
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

/**
 * Mousquetaires : casaque bleu roi, liseré or, parchemin d'édit royal.
 * Scores or pâle : vert émeraude / rouge cardinal ; chrono argent poli.
 */
const MUSKETEERS: Record<ThemeTargetType, Record<string, string>> = {
  arena: {
    '--bg': 'radial-gradient(ellipse at 50% 20%, #1f3f8f 0%, #13285e 55%, #0a1638 100%)',
    '--text': '#f5ecd2',
    '--header-bg': 'linear-gradient(180deg, #1a2f6b 0%, #0e1d47 100%)',
    '--match-bg': 'linear-gradient(180deg, #fbf5e3 0%, #efe3c0 100%)',
    '--fencer-name-color': '#14224d',
    '--fencer-club-color': '#6b5a2e',
    '--green-side-bg': 'linear-gradient(135deg, #eef3e6 0%, #d3e2c6 100%)',
    '--green-side-border': '#1f5e3a',
    '--red-side-bg': 'linear-gradient(135deg, #f7e3e6 0%, #e9c0c7 100%)',
    '--red-side-border': '#8e1530',
    '--score-bg': '#070a14',
    '--score-green': '#8fe3b0',
    '--score-green-glow': 'rgba(143,227,176,0.7), rgba(31,94,58,0.4)',
    '--score-red': '#ff5a6e',
    '--score-red-glow': 'rgba(255,90,110,0.7), rgba(142,21,48,0.4)',
    '--timer-bg': '#070a14',
    '--timer-color': '#d9dee8',
    '--timer-glow': 'rgba(217,222,232,0.85), rgba(150,160,180,0.4)',
    '--timer-border': '#c9a43e',
    '--timer-run-color': '#ffffff',
    '--timer-run-glow': 'rgba(255,255,255,0.9), rgba(200,210,230,0.5)',
    '--timer-run-border': '#e8c35a',
    '--waiting-color': '#f5ecd2',
    '--idle-number-color': 'rgba(245,236,210,0.9)',
    '--idle-label-color': 'rgba(232,195,90,0.75)',
    '--score-font-family': 'Georgia, serif',
    '--timer-font-family': 'Georgia, serif',
    '--fencer-name-font-family': 'Georgia, serif',
    '--vs-color': '#e8c35a',
    '--vs-font-family': 'Georgia, serif',
  },
  kiosk: {
    '--k-bg': 'radial-gradient(ellipse at top, #1a3478 0%, #0a1638 100%)',
    '--k-accent': '#e8c35a',
    '--k-accent2': '#8e1530',
    '--k-card-bg': 'rgba(232,195,90,0.07)',
    '--k-border': 'rgba(201,164,62,0.45)',
    '--k-muted': 'rgba(245,236,210,0.6)',
    '--k-progress': 'linear-gradient(90deg, #8e1530, #e8c35a, #1f5e3a)',
  },
  public: {
    '--pub-bg': 'radial-gradient(ellipse at top, #1f3f8f 0%, #0a1638 100%)',
    '--pub-header-bg': 'linear-gradient(180deg, #1a2f6b 0%, #0e1d47 100%)',
    '--pub-accent': '#e8c35a',
    '--pub-accent2': '#8e1530',
    '--pub-text': '#f5ecd2',
    '--pub-muted': 'rgba(245,236,210,0.6)',
    '--pub-card-bg': 'rgba(232,195,90,0.07)',
    '--pub-border': 'rgba(201,164,62,0.45)',
  },
  referee: {
    '--ref-bg': 'radial-gradient(ellipse at top, #1f3f8f 0%, #0a1638 100%)',
    '--ref-header-bg': 'linear-gradient(180deg, #1a2f6b 0%, #0e1d47 100%)',
    '--ref-accent': '#e8c35a',
    '--ref-accent2': '#8e1530',
    '--ref-text': '#f5ecd2',
    '--ref-muted': 'rgba(245,236,210,0.6)',
    '--ref-card-bg': 'rgba(232,195,90,0.07)',
    '--ref-border': 'rgba(201,164,62,0.45)',
  },
  pool: {
    '--pool-bg': '#0e1d47',
    '--pool-header-bg': 'linear-gradient(180deg, #1a2f6b 0%, #0e1d47 100%)',
    '--pool-accent': '#e8c35a',
    '--pool-accent2': '#8e1530',
    '--pool-text': '#f5ecd2',
    '--pool-muted': 'rgba(245,236,210,0.6)',
    '--pool-card-bg': 'rgba(232,195,90,0.07)',
    '--pool-border': 'rgba(201,164,62,0.45)',
  },
};

/**
 * Arcade 8-bit : borne de salle de jeux, noir profond, néons saturés, chiffres pixel.
 * Côté vert = vert phosphore, côté rouge = magenta ; chrono jaune « INSERT COIN ».
 */
const ARCADE: Record<ThemeTargetType, Record<string, string>> = {
  arena: {
    '--bg': 'repeating-linear-gradient(0deg, #07001a 0px, #07001a 3px, #0d0230 3px, #0d0230 4px)',
    '--text': '#e0f7ff',
    '--header-bg': 'linear-gradient(90deg, #2b0057 0%, #00135e 100%)',
    '--match-bg': '#0b0420',
    '--fencer-name-color': '#00f0ff',
    '--fencer-club-color': '#b07cff',
    '--green-side-bg': 'linear-gradient(135deg, #001a0d 0%, #00331a 100%)',
    '--green-side-border': '#39ff14',
    '--red-side-bg': 'linear-gradient(135deg, #1a0014 0%, #33002a 100%)',
    '--red-side-border': '#ff2bd6',
    '--score-bg': '#000000',
    '--score-green': '#39ff14',
    '--score-green-glow': 'rgba(57,255,20,0.9), rgba(57,255,20,0.45)',
    '--score-red': '#ff2bd6',
    '--score-red-glow': 'rgba(255,43,214,0.9), rgba(255,43,214,0.45)',
    '--timer-bg': '#000000',
    '--timer-color': '#ffe600',
    '--timer-glow': 'rgba(255,230,0,0.95), rgba(255,170,0,0.5)',
    '--timer-border': '#00f0ff',
    '--timer-run-color': '#00f0ff',
    '--timer-run-glow': 'rgba(0,240,255,0.95), rgba(0,140,255,0.5)',
    '--timer-run-border': '#ff2bd6',
    '--waiting-color': '#ffe600',
    '--idle-number-color': '#00f0ff',
    '--idle-label-color': 'rgba(255,43,214,0.8)',
    '--score-font-family': '"Lucida Console", monospace',
    '--timer-font-family': '"Lucida Console", monospace',
    '--fencer-name-font-family': '"Lucida Console", monospace',
    '--vs-color': '#ffe600',
    '--vs-font-family': '"Lucida Console", monospace',
  },
  kiosk: {
    '--k-bg': '#07001a',
    '--k-accent': '#ffe600',
    '--k-accent2': '#00f0ff',
    '--k-card-bg': 'rgba(0, 240, 255, 0.06)',
    '--k-border': 'rgba(255, 43, 214, 0.5)',
    '--k-muted': '#b07cff',
    '--k-progress': 'linear-gradient(90deg, #39ff14, #00f0ff, #ff2bd6)',
  },
  public: {
    '--pub-bg':
      'repeating-linear-gradient(0deg, #07001a 0px, #07001a 3px, #0d0230 3px, #0d0230 4px)',
    '--pub-header-bg': 'linear-gradient(90deg, #2b0057 0%, #00135e 100%)',
    '--pub-accent': '#ffe600',
    '--pub-accent2': '#00f0ff',
    '--pub-text': '#e0f7ff',
    '--pub-muted': '#b07cff',
    '--pub-card-bg': 'rgba(0, 240, 255, 0.06)',
    '--pub-border': 'rgba(255, 43, 214, 0.5)',
  },
  referee: {
    '--ref-bg':
      'repeating-linear-gradient(0deg, #07001a 0px, #07001a 3px, #0d0230 3px, #0d0230 4px)',
    '--ref-header-bg': 'linear-gradient(90deg, #2b0057 0%, #00135e 100%)',
    '--ref-accent': '#ffe600',
    '--ref-accent2': '#00f0ff',
    '--ref-text': '#e0f7ff',
    '--ref-muted': '#b07cff',
    '--ref-card-bg': 'rgba(0, 240, 255, 0.06)',
    '--ref-border': 'rgba(255, 43, 214, 0.5)',
  },
  pool: {
    '--pool-bg': '#07001a',
    '--pool-header-bg': 'linear-gradient(90deg, #2b0057 0%, #00135e 100%)',
    '--pool-accent': '#ffe600',
    '--pool-accent2': '#00f0ff',
    '--pool-text': '#e0f7ff',
    '--pool-muted': '#b07cff',
    '--pool-card-bg': 'rgba(0, 240, 255, 0.06)',
    '--pool-border': 'rgba(255, 43, 214, 0.5)',
  },
};

/**
 * Sumi-e : papier de riz, encre de Chine, rouge tampon (hanko). Clair et sobre.
 * Côté rouge = vermillon, côté vert = vert bambou ; chiffres à l'encre.
 */
const SUMIE: Record<ThemeTargetType, Record<string, string>> = {
  arena: {
    '--bg': 'radial-gradient(ellipse at 30% 20%, #f7f2e6 0%, #ebe3d1 70%, #ddd2bb 100%)',
    '--text': '#1b1b1b',
    '--header-bg': 'linear-gradient(180deg, #efe7d4 0%, #e2d8c0 100%)',
    '--match-bg': 'rgba(255,253,246,0.92)',
    '--fencer-name-color': '#111111',
    '--fencer-club-color': '#6e675a',
    '--green-side-bg': 'linear-gradient(135deg, #f6f5ec 0%, #e5e8d6 100%)',
    '--green-side-border': '#4f7a3a',
    '--red-side-bg': 'linear-gradient(135deg, #faf1ea 0%, #f1dccf 100%)',
    '--red-side-border': '#c8321e',
    '--score-bg': '#fbf8ef',
    '--score-green': '#2f5a22',
    '--score-green-glow': 'rgba(47,90,34,0.15), rgba(47,90,34,0.05)',
    '--score-red': '#c8321e',
    '--score-red-glow': 'rgba(200,50,30,0.15), rgba(200,50,30,0.05)',
    '--timer-bg': '#1b1b1b',
    '--timer-color': '#f7f2e6',
    '--timer-glow': 'rgba(247,242,230,0.35), rgba(247,242,230,0.1)',
    '--timer-border': '#c8321e',
    '--timer-run-color': '#ffffff',
    '--timer-run-glow': 'rgba(255,255,255,0.4), rgba(255,255,255,0.15)',
    '--timer-run-border': '#c8321e',
    '--waiting-color': '#1b1b1b',
    '--idle-number-color': 'rgba(27,27,27,0.85)',
    '--idle-label-color': 'rgba(200,50,30,0.8)',
    '--score-font-family': 'Georgia, serif',
    '--timer-font-family': 'Georgia, serif',
    '--fencer-name-font-family': 'Georgia, serif',
    '--vs-color': '#c8321e',
    '--vs-font-family': 'Georgia, serif',
  },
  kiosk: {
    '--k-bg': 'radial-gradient(ellipse at 30% 20%, #f7f2e6 0%, #e4dbc6 100%)',
    '--k-accent': '#c8321e',
    '--k-accent2': '#4f7a3a',
    '--k-card-bg': 'rgba(27, 27, 27, 0.04)',
    '--k-border': 'rgba(27, 27, 27, 0.18)',
    '--k-muted': '#6e675a',
    '--k-progress': 'linear-gradient(90deg, #1b1b1b, #c8321e)',
  },
  public: {
    '--pub-bg': 'radial-gradient(ellipse at 30% 20%, #f7f2e6 0%, #e4dbc6 100%)',
    '--pub-header-bg': 'linear-gradient(180deg, #1b1b1b 0%, #2c2c2c 100%)',
    '--pub-accent': '#c8321e',
    '--pub-accent2': '#4f7a3a',
    '--pub-text': '#1b1b1b',
    '--pub-muted': '#6e675a',
    '--pub-card-bg': 'rgba(27, 27, 27, 0.04)',
    '--pub-border': 'rgba(27, 27, 27, 0.18)',
  },
  referee: {
    '--ref-bg': 'radial-gradient(ellipse at 30% 20%, #f7f2e6 0%, #e4dbc6 100%)',
    '--ref-header-bg': 'linear-gradient(180deg, #1b1b1b 0%, #2c2c2c 100%)',
    '--ref-accent': '#c8321e',
    '--ref-accent2': '#4f7a3a',
    '--ref-text': '#1b1b1b',
    '--ref-muted': '#6e675a',
    '--ref-card-bg': 'rgba(27, 27, 27, 0.04)',
    '--ref-border': 'rgba(27, 27, 27, 0.18)',
  },
  pool: {
    '--pool-bg': '#f2ecdd',
    '--pool-header-bg': 'linear-gradient(180deg, #1b1b1b 0%, #2c2c2c 100%)',
    '--pool-accent': '#c8321e',
    '--pool-accent2': '#4f7a3a',
    '--pool-text': '#1b1b1b',
    '--pool-muted': '#6e675a',
    '--pool-card-bg': 'rgba(27, 27, 27, 0.04)',
    '--pool-border': 'rgba(27, 27, 27, 0.18)',
  },
};

/** Thèmes décoratifs proposés sur tous les écrans (clé = suffixe d'id et de libellé i18n) */
const DECORATIVE_THEMES: Record<string, Record<ThemeTargetType, Record<string, string>>> = {
  steampunk: STEAMPUNK,
  musketeers: MUSKETEERS,
  arcade: ARCADE,
  sumie: SUMIE,
};

type Translate = (key: string) => string;

/** Options prédéfinies affichées pour une section */
export function getBuiltinThemeOptions(
  section: GlobalThemeSection,
  t: Translate
): { id: string; label: string }[] {
  const decorative = Object.keys(DECORATIVE_THEMES).map(k => ({
    id: `${BUILTIN_THEME_PREFIX}${k}`,
    label: t(`rsm.theme_${k}`),
  }));
  if (section === 'arena' || section === 'all') {
    return [
      ...ARENA_PRESETS.map(p => ({
        id: `${BUILTIN_THEME_PREFIX}${p}`,
        label: t(`rsm.theme_${p}`),
      })),
      ...decorative,
    ];
  }
  return [{ id: `${BUILTIN_THEME_PREFIX}default`, label: t('rsm.theme_default') }, ...decorative];
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
  if (Object.prototype.hasOwnProperty.call(DECORATIVE_THEMES, key)) {
    return {
      theme: {
        id,
        name: t(`rsm.theme_${key}`),
        targetType: section,
        variables: { ...sectionDefaults(section), ...DECORATIVE_THEMES[key][section] },
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
      variables: { ...sectionDefaults(section) },
    },
  };
}

/**
 * Thèmes prédéfinis explorables dans l'éditeur (lecture seule, duplicables) :
 * variables complètes, y compris pour les préréglages piste Sombre/Clair/Néon.
 */
export function getEditorBuiltinThemes(section: ThemeTargetType, t: Translate): CustomTheme[] {
  return getBuiltinThemeOptions(section, t).map(({ id, label }) => {
    const key = id.slice(BUILTIN_THEME_PREFIX.length);
    const base = sectionDefaults(section);
    const variables =
      key === 'light' || key === 'neon'
        ? { ...base, ...ARENA_PRESET_VARS[key] }
        : Object.prototype.hasOwnProperty.call(DECORATIVE_THEMES, key)
          ? { ...base, ...DECORATIVE_THEMES[key][section] }
          : { ...base };
    return { id, name: label, targetType: section, variables };
  });
}

/** Application d'un thème à un type d'écran : préréglage piste ou thème custom */
export type ThemeApplication =
  | { section: ThemeTargetType; preset: DisplayTheme; theme?: undefined }
  | { section: ThemeTargetType; preset?: undefined; theme: CustomTheme };

/**
 * « Toutes sources » (#1795) : écrans concernés par le thème choisi.
 * Préréglage piste → piste seule ; décoratif → chaque écran (variables propres) ;
 * thème sauvegardé → son type d'écran.
 */
export function resolveAllSourcesTheme(
  id: string,
  savedThemes: CustomTheme[],
  t: Translate
): ThemeApplication[] {
  if (isBuiltinThemeId(id)) {
    const out: ThemeApplication[] = [];
    for (const section of THEME_SECTIONS) {
      const r = resolveBuiltinTheme(section, id, t);
      if (r?.preset) out.push({ section, preset: r.preset });
      else if (r?.theme) out.push({ section, theme: r.theme });
    }
    return out;
  }
  const saved = savedThemes.find(x => x.id === id);
  return saved ? [{ section: saved.targetType ?? 'arena', theme: saved }] : [];
}
