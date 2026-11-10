import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// #1537 : anneau de focus global défini par token pour toutes les pages distantes.
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

describe('focus visible global des pages distantes (#1537)', () => {
  it('tokens.css définit :focus-visible 2 px / décalage 2 px et forced-colors', () => {
    const css = read('tokens.css');
    expect(css).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus-ring-color\)[^}]*outline-offset:\s*2px/
    );
    expect(css).toMatch(/@media \(forced-colors: active\)[\s\S]*Highlight/);
  });

  it('chaque page distante charge tokens.css', () => {
    const pages = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));
    const missing = pages.filter(f => !read(f).includes('tokens.css'));
    expect(missing).toEqual([]);
  });

  it('styles.css ne supprime pas le focus sans repli visible', () => {
    const css = read('styles.css');
    const blocks = css.match(/:focus\s*\{[^}]*outline:\s*none[^}]*\}/g) ?? [];
    for (const b of blocks) expect(b).toMatch(/box-shadow|border-color/);
  });
});
