// @vitest-environment jsdom
/**
 * Module /js/icons.js (#1532) : jeu d'icônes SVG partagé des pages distantes.
 * Le dernier bloc vérifie que toute page qui s'en sert charge le script.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const { svg, hydrate, rank, names } = req('./icons.js');
const remoteDir = path.join(__dirname, '..');

describe('icons.js', () => {
  it('rend un SVG décoratif, taille 1em, couleur héritée', () => {
    const el = document.createElement('div');
    el.innerHTML = svg('trophy');
    const s = el.querySelector('svg')!;
    expect(s.getAttribute('aria-hidden')).toBe('true');
    expect(s.getAttribute('stroke')).toBe('currentColor');
    expect(s.getAttribute('width')).toBe('1em');
    expect(s.getAttribute('focusable')).toBe('false');
    expect(s.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('icônes pleines : fill = currentColor', () => {
    const el = document.createElement('div');
    el.innerHTML = svg('dot');
    expect(el.querySelector('svg')!.getAttribute('fill')).toBe('currentColor');
  });

  it('nom inconnu ou hostile : chaîne vide, aucun HTML injecté', () => {
    expect(svg('nope')).toBe('');
    expect(svg('"><img src=x onerror=alert(1)>')).toBe('');
    expect(svg('__proto__')).toBe('');
    expect(svg('constructor')).toBe('');
  });

  it('classe additionnelle échappée', () => {
    const el = document.createElement('div');
    el.innerHTML = svg('zap', 'a" onload="x()');
    const s = el.querySelector('svg')!;
    expect(s.hasAttribute('onload')).toBe(false);
    expect(s.getAttribute('class')).toContain('a"');
  });

  it('hydrate remplit [data-icon] et reste idempotent', () => {
    document.body.innerHTML = '<span data-icon="swords"></span><span data-icon="inconnu"></span>';
    hydrate(document);
    hydrate(document);
    const [a, b] = Array.from(document.querySelectorAll('[data-icon]'));
    expect(a.querySelectorAll('svg')).toHaveLength(1);
    expect(a.getAttribute('aria-hidden')).toBe('true');
    expect(b.querySelector('svg')).toBeNull();
  });

  it('rank : médaille pour 1-3, texte au-delà', () => {
    expect(rank(1)).toContain('<svg');
    expect(rank(2)).toContain('aria-label="2e"');
    expect(rank(3)).toContain('--tw-orange-600');
    expect(rank(4)).toBe('4e');
    expect(rank(7, '')).toBe('7');
  });

  it('expose des noms sans doublon', () => {
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('pages distantes', () => {
  const pages = fs.readdirSync(remoteDir).filter(f => f.endsWith('.html'));
  it.each(pages)('%s charge /js/icons.js dès qu’elle utilise une icône', page => {
    const text = fs.readFileSync(path.join(remoteDir, page), 'utf8');
    if (/data-icon=|bpIcon\(|bpRank\(|BPIcons\./.test(text)) {
      expect(text).toContain('src="/js/icons.js"');
    }
  });
});

describe('noms d’icônes utilisés', () => {
  const files = [
    ...fs.readdirSync(remoteDir).filter(f => /\.(html|js)$/.test(f)),
    ...fs.readdirSync(__dirname).filter(f => /\.js$/.test(f) && f !== 'icons.js'),
  ].map(f =>
    fs.existsSync(path.join(remoteDir, f)) ? path.join(remoteDir, f) : path.join(__dirname, f)
  );
  it('chaque data-icon / bpIcon / icon: référence une icône du jeu', () => {
    const unknown: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      const re =
        /data-icon="([a-z-]+)"|bpIcon\('([a-z-]+)'|icon: '([a-z-]+)'|iconName: '([a-z-]+)'/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const name = m[1] || m[2] || m[3] || m[4];
        if (!names.includes(name)) unknown.push(`${path.basename(f)}:${name}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});
