// @vitest-environment jsdom
/**
 * Échelle typographique fluide, mode contraste projecteur, overlay-config sans px fixes (#1540).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const common = req('./common.js');
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

describe('échelle typographique fluide (#1540)', () => {
  it('tokens.css définit les tailles en clamp()', () => {
    const css = read('tokens.css');
    for (const n of ['xs', 'sm', 'md', 'lg', 'xl', 'display']) {
      expect(css).toMatch(new RegExp(`--fs-${n}:\\s*clamp\\(`));
    }
  });

  it('overlay-config : aucune taille de police en px', () => {
    expect(read('overlay-config.html')).not.toMatch(/font-size:\s*\d+px/);
  });

  it('overlay-config : colonne latérale fluide', () => {
    expect(read('overlay-config.html')).toContain('grid-template-columns: clamp(');
  });
});

describe('mode contraste projecteur (#1540)', () => {
  beforeEach(() => {
    document.documentElement.className = '';
  });

  it('?contrast=1 active la classe et mémorise', () => {
    const store: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };
    expect(common.applyContrast(document, '?contrast=1', storage)).toBe(true);
    expect(document.documentElement.classList.contains('theme-contrast')).toBe(true);
    // sans paramètre : lu depuis le stockage
    document.documentElement.className = '';
    expect(common.applyContrast(document, '', storage)).toBe(true);
    // ?contrast=0 retire
    expect(common.applyContrast(document, '?contrast=0', storage)).toBe(false);
    expect(document.documentElement.classList.contains('theme-contrast')).toBe(false);
  });

  it('stockage indisponible : le paramètre reste appliqué', () => {
    const broken = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    };
    expect(common.applyContrast(document, '?contrast=1', broken)).toBe(true);
  });

  it('tokens.css : .theme-contrast sans couleur en dur', () => {
    const css = read('tokens.css');
    const block = css.slice(css.indexOf('.theme-contrast'));
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
