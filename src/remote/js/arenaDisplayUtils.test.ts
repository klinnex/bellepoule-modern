// @vitest-environment jsdom
/**
 * Module /js/arenaDisplayUtils.js (#1401) : bannière texte seul, id d'arène, thèmes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const { setBannerLines, arenaIdFromPath, applyArenaTheme } = req('./arenaDisplayUtils.js');

const store = () => {
  const m: Record<string, string> = {};
  return { setItem: (k: string, v: string) => void (m[k] = v), get: (k: string) => m[k] };
};

describe('arenaDisplayUtils.js', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-overlay');
  });

  it('bannière : texte seul, jamais interprété comme HTML', () => {
    const b = document.createElement('div');
    setBannerLines(b, '<img src=x onerror=alert(1)>', '<b>x</b>');
    expect(b.querySelector('img')).toBeNull();
    expect(b.querySelector('b')).toBeNull();
    expect(b.children).toHaveLength(2);
    expect(b.children[0].textContent).toBe('<img src=x onerror=alert(1)>');
    setBannerLines(b, 'seule');
    expect(b.children).toHaveLength(1);
  });

  it('id d’arène depuis le chemin', () => {
    expect(arenaIdFromPath('/arene3')).toBe('arena3');
    expect(arenaIdFromPath('/Arena12/x')).toBe('arena12');
    expect(arenaIdFromPath('/')).toBe('arena1');
  });

  it('thèmes valides, repli sur dark, mémorisation', () => {
    const s = store();
    expect(applyArenaTheme(document, s, 'neon')).toBe('neon');
    expect(document.documentElement.getAttribute('data-theme')).toBe('neon');
    expect(applyArenaTheme(document, s, 'inconnu')).toBe('dark');
    expect(s.get('displayTheme')).toBe('dark');
  });

  it('thème personnalisé : variables et overlay, nettoyé au retour', () => {
    const s = store();
    const custom = { variables: { '--bg': '#123' }, overlayMode: true };
    expect(applyArenaTheme(document, s, 'custom', custom)).toBe('custom');
    expect(document.getElementById('custom-theme-style')!.textContent).toContain('--bg: #123;');
    expect(document.documentElement.getAttribute('data-overlay')).toBe('true');
    applyArenaTheme(document, s, 'light');
    expect(document.getElementById('custom-theme-style')).toBeNull();
    expect(document.documentElement.hasAttribute('data-overlay')).toBe(false);
    expect(applyArenaTheme(document, s, 'custom')).toBe('dark');
  });

  it('arena.html charge le module avant le script de page', () => {
    const html = fs.readFileSync(path.join(__dirname, '../arena.html'), 'utf8');
    const tag = html.indexOf('<script src="/js/arenaDisplayUtils.js"></script>');
    expect(tag).toBeGreaterThan(-1);
    expect(tag).toBeLessThan(html.indexOf('class ArenaDisplay'));
    expect(html).not.toContain('function setBannerLines');
  });
});
