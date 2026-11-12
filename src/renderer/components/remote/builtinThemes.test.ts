import { describe, it, expect } from 'vitest';
import { getBuiltinThemeOptions, resolveBuiltinTheme } from './builtinThemes';

const t = (k: string) => k;

describe('builtinThemes', () => {
  it('liste jamais vide pour chaque section', () => {
    for (const s of ['arena', 'kiosk', 'public', 'referee', 'pool'] as const) {
      expect(getBuiltinThemeOptions(s, t).length).toBeGreaterThan(0);
    }
  });

  it('piste : préréglages Sombre/Clair/Néon', () => {
    expect(getBuiltinThemeOptions('arena', t).map(o => o.id)).toEqual([
      'builtin:dark',
      'builtin:light',
      'builtin:neon',
    ]);
    expect(resolveBuiltinTheme('arena', 'builtin:light', t)).toEqual({ preset: 'light' });
  });

  it('autres écrans : thème custom aux valeurs par défaut', () => {
    const r = resolveBuiltinTheme('referee', 'builtin:default', t);
    expect(r?.theme?.targetType).toBe('referee');
    expect(Object.keys(r?.theme?.variables ?? {}).length).toBeGreaterThan(0);
  });

  it('id non prédéfini ou inconnu → null', () => {
    expect(resolveBuiltinTheme('arena', 'custom-1', t)).toBeNull();
    expect(resolveBuiltinTheme('arena', 'builtin:default', t)).toBeNull();
    expect(resolveBuiltinTheme('pool', 'builtin:dark', t)).toBeNull();
  });
});
