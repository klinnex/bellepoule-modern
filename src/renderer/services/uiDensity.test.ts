// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  UI_DENSITY_STORAGE_KEY,
  applyUiDensity,
  loadUiDensity,
  normalizeUiDensity,
  saveUiDensity,
} from './uiDensity';

describe('densité d’affichage (#1541)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-density');
  });

  it('valeurs admises uniquement, standard par défaut', () => {
    expect(normalizeUiDensity('compact')).toBe('compact');
    expect(normalizeUiDensity('comfortable')).toBe('comfortable');
    expect(normalizeUiDensity('dense')).toBe('standard');
    expect(normalizeUiDensity(null)).toBe('standard');
    expect(loadUiDensity()).toBe('standard');
  });

  it('enregistrement : attribut appliqué et relu au démarrage', () => {
    saveUiDensity('compact');
    expect(localStorage.getItem(UI_DENSITY_STORAGE_KEY)).toBe('compact');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    document.documentElement.removeAttribute('data-density');
    applyUiDensity(loadUiDensity());
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  it('tokens.css : variables de densité compacte et confortable', () => {
    const css = fs.readFileSync(path.join(__dirname, '../styles/tokens.css'), 'utf8');
    expect(css).toContain("[data-density='compact']");
    expect(css).toContain("[data-density='comfortable']");
    expect(css).toContain('--density-cell-y:');
  });
});
