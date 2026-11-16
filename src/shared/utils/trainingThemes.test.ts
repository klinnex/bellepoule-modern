import { describe, it, expect } from 'vitest';
import { TRAINING_THEMES, isTrainingTheme, resolveTrainingTheme } from './trainingThemes';

describe('trainingThemes (#1500)', () => {
  it('liste fermée, Mousquetaires inclus', () => {
    expect(TRAINING_THEMES).toContain('musketeers');
    expect(isTrainingTheme('musketeers')).toBe(true);
    expect(isTrainingTheme('custom')).toBe(false);
    expect(isTrainingTheme(undefined)).toBe(false);
  });

  it('sombre : défaut partout (pas de thème arbitre, kiosk prédéfini)', () => {
    const r = resolveTrainingTheme('dark');
    expect(r.arena).toEqual({ theme: 'dark' });
    expect(r.referee).toBeUndefined();
    expect(r.kiosk).toEqual({ '--k-preset': 'default' });
  });

  it('chaque thème hors sombre change kiosk et tablette arbitre', () => {
    for (const theme of TRAINING_THEMES.filter(t => t !== 'dark')) {
      const r = resolveTrainingTheme(theme);
      expect(r.referee?.targetType).toBe('referee');
      expect(r.referee?.variables['--ref-bg']).toBeTruthy();
      expect(r.kiosk['--k-preset']).toBeDefined();
    }
  });

  it('Mousquetaires : piste en thème personnalisé', () => {
    const r = resolveTrainingTheme('musketeers');
    expect(r.arena.theme).toBe('custom');
    expect(r.arena.customTheme?.variables['--bg']).toContain('#1f3f8f');
    expect(r.kiosk['--k-accent']).toBe('#e8c35a');
  });
});
