/**
 * BellePoule Modern - Thèmes visuels du mode entraînement (#1500).
 * Un thème choisi dans la fenêtre Entraînement s'applique à tous les écrans :
 * affichage de piste, kiosk, tablette d'arbitre et lobby.
 * Licensed under GPL-3.0
 */
import type { CustomTheme, DisplayTheme, ThemeTargetType } from '../types/remote';

export type TrainingTheme = 'dark' | 'light' | 'neon' | 'unicorn' | 'musketeers';

export const TRAINING_THEMES: readonly TrainingTheme[] = [
  'dark',
  'light',
  'neon',
  'unicorn',
  'musketeers',
];

export function isTrainingTheme(value: unknown): value is TrainingTheme {
  return typeof value === 'string' && (TRAINING_THEMES as readonly string[]).includes(value);
}

/**
 * Mousquetaires : casaque bleu roi, liseré or, parchemin d'édit royal.
 * Scores or pâle : vert émeraude / rouge cardinal ; chrono argent poli.
 */
export const MUSKETEERS_THEME: Record<ThemeTargetType, Record<string, string>> = {
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

/** Tablette d'arbitre : variables --ref-* (null = thème par défaut) */
const REFEREE_VARS: Record<Exclude<TrainingTheme, 'musketeers'>, Record<string, string> | null> = {
  dark: null,
  light: {
    '--ref-bg': 'linear-gradient(135deg, #3d5f94 0%, #6a8cc4 100%)',
    '--ref-header-bg': 'rgba(255, 255, 255, 0.18)',
    '--ref-text': '#ffffff',
  },
  neon: {
    '--ref-bg': 'radial-gradient(ellipse at top, #0f1f17 0%, #0a0a0a 70%)',
    '--ref-header-bg': 'rgba(0, 255, 136, 0.1)',
    '--ref-text': '#eafff4',
  },
  unicorn: {
    '--ref-bg': 'linear-gradient(135deg, #2a0f4a 0%, #6b2a8e 55%, #b83f86 100%)',
    '--ref-header-bg': 'rgba(255, 122, 217, 0.15)',
    '--ref-text': '#fff0fb',
  },
};

/** Kiosk : --k-preset (défaut / clair / néon) puis variables --k-* */
const KIOSK_VARS: Record<Exclude<TrainingTheme, 'musketeers'>, Record<string, string>> = {
  dark: { '--k-preset': 'default' },
  light: { '--k-preset': 'light' },
  neon: { '--k-preset': 'neon' },
  unicorn: {
    '--k-preset': 'default',
    '--k-bg': 'radial-gradient(ellipse at top, #6b2a8e 0%, #2a0f4a 100%)',
    '--k-accent': '#ff7ad9',
    '--k-accent2': '#8b5cf6',
    '--k-card-bg': 'rgba(255, 122, 217, 0.07)',
    '--k-border': 'rgba(255, 122, 217, 0.35)',
    '--k-muted': 'rgba(255, 230, 250, 0.65)',
    '--k-progress': 'linear-gradient(90deg, #8b5cf6, #ff7ad9, #ffd36e)',
  },
};

export interface TrainingThemeTargets {
  /** Thème de l'affichage de piste */
  arena: { theme: DisplayTheme; customTheme?: CustomTheme };
  kiosk: Record<string, string>;
  /** Thème de la tablette d'arbitre (undefined = défaut) */
  referee?: CustomTheme;
}

/** Résout un thème d'entraînement en thèmes par type d'écran. */
export function resolveTrainingTheme(theme: TrainingTheme): TrainingThemeTargets {
  const custom = (targetType: ThemeTargetType, variables: Record<string, string>): CustomTheme => ({
    id: `training:${theme}:${targetType}`,
    name: theme,
    targetType,
    variables,
  });
  if (theme === 'musketeers') {
    return {
      arena: { theme: 'custom', customTheme: custom('arena', MUSKETEERS_THEME.arena) },
      kiosk: { '--k-preset': 'default', ...MUSKETEERS_THEME.kiosk },
      referee: custom('referee', MUSKETEERS_THEME.referee),
    };
  }
  const ref = REFEREE_VARS[theme];
  return {
    arena: { theme },
    kiosk: KIOSK_VARS[theme],
    referee: ref ? custom('referee', ref) : undefined,
  };
}
