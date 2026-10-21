/**
 * BellePoule Modern - Traductions françaises réelles pour les tests de composants, sans
 * TranslationProvider : `vi.mock('…/hooks/useTranslation', () => import('…/testUtils/i18nMock'))`.
 * Licensed under GPL-3.0
 */
import fr from '../locales/fr.json';

type Params = Record<string, string | number>;

const lookup = (key: string): string | undefined => {
  let node: unknown = fr;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
};

/** `t` français : pluriels `_one` / `_other` (count < 2 → one), interpolation `{{x}}`. */
export const frT = (key: string, params?: Params): string => {
  const count = params?.count;
  const plural =
    typeof count === 'number' ? `${key}_${Math.abs(count) < 2 ? 'one' : 'other'}` : null;
  const template = (plural && lookup(plural)) ?? lookup(key);
  if (template === undefined) return key;
  return template.replace(/\{\{(\w+)\}\}/g, (m, p) => (params?.[p] ?? m).toString());
};

export const useTranslation = () => ({ t: frT, language: 'fr' as const });
