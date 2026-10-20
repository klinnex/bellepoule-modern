import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { buildPageCsp } from '../main/remote/csp';

// #1153 : aucune police ni ressource de style chez un tiers (hors-ligne, RGPD).
const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Inter embarquée (#1153)', () => {
  it.each(['src/renderer/assets/fonts', 'src/remote/fonts'])(
    '%s : woff2 valides + licence OFL',
    dir => {
      for (const f of ['Inter-latin-Variable.woff2', 'Inter-latin-ext-Variable.woff2']) {
        const buf = readFileSync(join(root, dir, f));
        expect(buf.subarray(0, 4).toString()).toBe('wOF2');
      }
      expect(read(join(dir, 'Inter-OFL.txt'))).toContain('SIL Open Font License');
    }
  );

  it('@font-face locaux, font-display: swap', () => {
    for (const css of [read('src/renderer/styles/design.css'), read('src/remote/fonts.css')]) {
      expect(css).toMatch(/font-family: 'Inter';/);
      expect(css).toContain('font-display: swap');
      expect(css).toContain('Inter-latin-Variable.woff2');
      expect(css).toContain('Inter-latin-ext-Variable.woff2');
    }
  });

  it('aucun hôte Google Fonts dans les sources, pages et CSP', () => {
    const files = [
      'src/renderer/index.html',
      'src/renderer/styles/design.css',
      'src/main/main.ts',
      'src/main/remote/csp.ts',
      ...readdirSync(join(root, 'src/remote'))
        .filter(f => f.endsWith('.html'))
        .map(f => `src/remote/${f}`),
    ];
    for (const f of files) {
      expect(read(f), f).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    }
    expect(buildPageCsp('n')).not.toMatch(/google|gstatic/);
  });

  it('pages kiosque/dashboard : préchargement local', () => {
    for (const p of ['kiosk', 'dashboard']) {
      const html = read(`src/remote/${p}.html`);
      expect(html).toContain('href="/fonts.css"');
      expect(html).toContain('rel="preload" href="/fonts/Inter-latin-Variable.woff2"');
    }
  });

  it('service worker met les polices en précache', () => {
    const sw = read('src/remote/sw.js');
    expect(sw).toContain('/fonts.css');
    expect(sw).toContain('/fonts/Inter-latin-Variable.woff2');
    expect(existsSync(join(root, 'src/remote/fonts.css'))).toBe(true);
  });
});
