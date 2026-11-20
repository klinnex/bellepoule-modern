// @vitest-environment jsdom
/**
 * Module /js/ui.js (#1538) : composants communs et thème des pages distantes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);
const ui = req('./ui.js');

describe('ui.js', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.documentElement.className = '';
  });

  it('bouton : variante inconnue -> primary, libellé échappé', () => {
    const h = ui.button('<b>OK</b>', 'nope', 'data-x="1"');
    expect(h).toContain('bp-btn--primary');
    expect(h).toContain('&lt;b&gt;OK&lt;/b&gt;');
    expect(h).toContain('data-x="1"');
    expect(ui.button('Non', 'danger')).toContain('bp-btn--danger');
  });

  it('badge de statut : classe selon le statut, repli pending, libellé échappé', () => {
    expect(ui.statusBadge('live', 'En cours')).toContain('bp-badge--live');
    expect(ui.statusBadge('current', 'x')).toContain('bp-badge--live');
    expect(ui.statusBadge('???', '<i>')).toContain('bp-badge--pending');
    expect(ui.statusBadge('???', '<i>')).toContain('&lt;i&gt;');
  });

  it('barre de score : parts proportionnelles, 50/50 sans point', () => {
    expect(ui.scoreBar(3, 1)).toContain('width:75%');
    expect(ui.scoreBar(0, 0)).toContain('width:50%');
    expect(ui.scoreBar(-4, 'x')).toContain('width:50%');
  });

  it('en-tête, carte, pied de page : titre échappé', () => {
    expect(ui.header('<x>', '<a>r</a>')).toContain('&lt;x&gt;');
    expect(ui.card('<p>c</p>')).toBe('<div class="bp-card"><p>c</p></div>');
    expect(ui.footer('a&b')).toContain('a&amp;b');
  });

  it('thème : enregistré > préférence système ; stockage indisponible toléré', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    expect(ui.getTheme(document, storage, true)).toBe('dark');
    expect(ui.getTheme(document, storage, false)).toBe('light');
    expect(ui.setTheme(document, storage, 'dark')).toBe('dark');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    expect(ui.getTheme(document, storage, false)).toBe('dark');
    const broken = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
    };
    expect(ui.getTheme(document, broken, false)).toBe('light');
    expect(ui.setTheme(document, broken, 'light')).toBe('light');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false);
  });

  it('init : injecte la feuille une seule fois', () => {
    ui.init(window);
    ui.init(window);
    expect(document.querySelectorAll('style[data-bp="ui"]').length).toBe(1);
  });

  it('la feuille des composants ne contient aucune couleur en dur', () => {
    expect(ui.CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(ui.CSS).toContain('var(--color-primary)');
  });

  it('pages simples chargent /js/ui.js avec data-bp-init (#1538)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const pages = ['results', 'journal', 'login', 'lobby', 'pool', 'dashboard', 'pool-ocr'];
    for (const n of pages) {
      const html = fs.readFileSync(path.join(__dirname, '..', n + '.html'), 'utf8');
      expect(html, n).toMatch(/<script src="\/js\/ui\.js" data-bp-init><\/script>/);
    }
  });

  it('auto-init : data-bp-init applique le thème au chargement', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, 'ui.js'), 'utf8');
    expect(src).toContain("hasAttribute('data-bp-init')");
  });
});
