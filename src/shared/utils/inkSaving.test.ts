/**
 * Tests de l'économie d'encre (Paramètres → Documents)
 * Licensed under GPL-3.0
 */
import { describe, it, expect } from 'vitest';
import { applyInkSaving, INK_SAVING_CSS } from './inkSaving';
import { validateAppSetting, APP_SETTINGS_DEFAULTS } from '../types/appSettings';

describe('applyInkSaving', () => {
  it('insère la feuille avant </head> sans retirer de contenu', () => {
    const html =
      '<html><head><style>.a{color:red}</style></head><body><p>Poule A</p></body></html>';
    const out = applyInkSaving(html);
    expect(out).toContain('data-ink-saving');
    expect(out).toContain('.a{color:red}');
    expect(out).toContain('<p>Poule A</p>');
    expect(out.indexOf('data-ink-saving')).toBeLessThan(out.indexOf('</head>'));
  });

  it('préfixe le style quand il n’y a pas de <head>', () => {
    const out = applyInkSaving('<p>seul</p>');
    expect(out.startsWith('<style data-ink-saving>')).toBe(true);
    expect(out.endsWith('<p>seul</p>')).toBe(true);
  });

  it('est idempotent', () => {
    const once = applyInkSaving('<head></head><body></body>');
    expect(applyInkSaving(once)).toBe(once);
  });

  it('retire les fonds et ramène le texte en noir', () => {
    expect(INK_SAVING_CSS).toMatch(/background-image:\s*none !important/);
    expect(INK_SAVING_CSS).toMatch(/color:\s*#000 !important/);
    expect(INK_SAVING_CSS).toMatch(/grayscale\(100%\)/);
  });
});

describe('réglage inkSaving', () => {
  it('est désactivé par défaut', () => {
    expect(APP_SETTINGS_DEFAULTS.inkSaving).toBe(false);
  });

  it('n’accepte que un booléen', () => {
    expect(validateAppSetting('inkSaving', true)).toBe(true);
    expect(() => validateAppSetting('inkSaving', 'oui')).toThrow(/inkSaving/);
  });
});
