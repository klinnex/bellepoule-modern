/**
 * BellePoule Modern - Thèmes prédéfinis du sélecteur « Thème global »
 * Liste jamais vide même sans thème sauvegardé : piste → Sombre/Clair/Néon,
 * autres écrans → valeurs par défaut de l'éditeur.
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

type Translate = (key: string) => string;

/** Options prédéfinies affichées pour une section */
export function getBuiltinThemeOptions(
  section: ThemeTargetType,
  t: Translate
): { id: string; label: string }[] {
  if (section === 'arena') {
    return ARENA_PRESETS.map(p => ({
      id: `${BUILTIN_THEME_PREFIX}${p}`,
      label: t(`rsm.theme_${p}`),
    }));
  }
  return [{ id: `${BUILTIN_THEME_PREFIX}default`, label: t('rsm.theme_default') }];
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
