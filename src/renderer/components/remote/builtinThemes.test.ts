import { describe, it, expect } from 'vitest';
import {
  getBuiltinThemeOptions,
  resolveAllSourcesTheme,
  resolveBuiltinTheme,
  THEME_SECTIONS,
} from './builtinThemes';

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
      'builtin:steampunk',
      'builtin:musketeers',
      'builtin:arcade',
      'builtin:sumie',
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

  it('Steampunk proposé et résolu pour chaque section', () => {
    for (const s of ['arena', 'kiosk', 'public', 'referee', 'pool'] as const) {
      expect(getBuiltinThemeOptions(s, t).map(o => o.id)).toContain('builtin:steampunk');
      const r = resolveBuiltinTheme(s, 'builtin:steampunk', t);
      expect(r?.theme?.targetType).toBe(s);
      expect(Object.values(r?.theme?.variables ?? {}).join(' ')).toMatch(/#d4a64a|#b5893b/);
    }
  });

  it('chaque thème décoratif couvre toutes les sections avec des variables connues', () => {
    for (const key of ['steampunk', 'musketeers', 'arcade', 'sumie']) {
      for (const s of ['arena', 'kiosk', 'public', 'referee', 'pool'] as const) {
        const base = resolveBuiltinTheme(s, s === 'arena' ? 'builtin:dark' : 'builtin:default', t);
        const r = resolveBuiltinTheme(s, `builtin:${key}`, t);
        expect(r?.theme?.name).toBe(`rsm.theme_${key}`);
        // aucune variable inventée : mêmes clés que les valeurs par défaut de l'éditeur
        if (base?.theme) {
          expect(Object.keys(r!.theme!.variables).sort()).toEqual(
            Object.keys(base.theme.variables).sort()
          );
        }
      }
    }
  });

  it('clé héritée de Object.prototype → null', () => {
    expect(resolveBuiltinTheme('pool', 'builtin:toString', t)).toBeNull();
  });
});

describe('Toutes sources (#1795)', () => {
  const t = (k: string) => k;
  it('liste préréglages piste et décoratifs', () => {
    const ids = getBuiltinThemeOptions('all', t).map(o => o.id);
    expect(ids).toContain('builtin:dark');
    expect(ids).toContain('builtin:steampunk');
  });
  it('décoratif → tous les écrans, préréglage → piste seule', () => {
    expect(resolveAllSourcesTheme('builtin:steampunk', [], t).map(a => a.section)).toEqual([
      ...THEME_SECTIONS,
    ]);
    expect(resolveAllSourcesTheme('builtin:neon', [], t)).toEqual([
      { section: 'arena', preset: 'neon' },
    ]);
  });
  it('thème sauvegardé → son type d’écran', () => {
    const saved = { id: 'c1', name: 'X', targetType: 'pool' as const, variables: {} };
    expect(resolveAllSourcesTheme('c1', [saved], t)).toEqual([{ section: 'pool', theme: saved }]);
    expect(resolveAllSourcesTheme('inconnu', [saved], t)).toEqual([]);
  });
});
