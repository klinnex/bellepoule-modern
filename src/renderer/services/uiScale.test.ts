// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  UI_SCALE_STORAGE_KEY,
  applyUiScale,
  loadUiScale,
  normalizeUiScale,
  saveUiScale,
} from './uiScale';

describe('taille du texte de l’interface (#1156)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty('--ui-scale');
  });

  it('valeurs admises uniquement, 100 % par défaut', () => {
    expect(normalizeUiScale('1.15')).toBe(1.15);
    expect(normalizeUiScale(1.3)).toBe(1.3);
    expect(normalizeUiScale('2')).toBe(1);
    expect(normalizeUiScale(null)).toBe(1);
    expect(loadUiScale()).toBe(1);
  });

  it('enregistrement : variable CSS appliquée et relue au démarrage', () => {
    saveUiScale(1.3);
    expect(localStorage.getItem(UI_SCALE_STORAGE_KEY)).toBe('1.3');
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.3');
    document.documentElement.style.removeProperty('--ui-scale');
    applyUiScale(loadUiScale());
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.3');
  });

  it('tokens.css : racine en fonction de --ui-scale, échelle --fs-*, contraste élevé', () => {
    const css = fs.readFileSync(path.join(__dirname, '../styles/tokens.css'), 'utf8');
    expect(css).toMatch(/html\s*\{\s*font-size:\s*calc\(16px \* var\(--ui-scale\)\)/);
    for (const t of ['--fs-xs', '--fs-2xl', '--space-4', '--z-modal', '--touch-target']) {
      expect(css).toContain(`${t}:`);
    }
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toContain('@media (forced-colors: active)');
    const index = fs.readFileSync(path.join(__dirname, '../index.tsx'), 'utf8');
    expect(index.indexOf("'./styles/tokens.css'")).toBeGreaterThan(
      index.indexOf("'./styles/design.css'")
    );
  });
});
