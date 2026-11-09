/**
 * Contraste WCAG AA des teintes sémantiques (#1531) : texte `--*-on-soft`
 * sur fond `--*-soft` composé sur chaque surface, clair et sombre (>= 4.5:1).
 * Licensed under GPL-3.0
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const theme = read('theme.css');
const tokens = read('tokens.css');
const design = read('design.css');

type RGB = [number, number, number];

function decl(css: string, prop: string, from = 0): string {
  const m = new RegExp(`${prop}:\\s*([^;]+);`).exec(css.slice(from));
  if (!m) throw new Error(`variable absente : ${prop}`);
  return m[1].trim();
}

function parse(v: string): { rgb: RGB; a: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(v);
  if (!m) throw new Error(`couleur illisible : ${v}`);
  return { rgb: [+m[1], +m[2], +m[3]], a: +m[4] };
}

const luminance = ([r, g, b]: RGB) => {
  const [R, G, B] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};

const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

function check(css: string, from: number, surfaces: string[]) {
  const rows: string[] = [];
  for (const t of ['success', 'warning', 'danger', 'info']) {
    const soft = parse(decl(css, `--${t}-soft`, from));
    const text = parse(decl(css, `--${t}-on-soft`, from)).rgb;
    for (const s of surfaces) {
      const bg = parse(s).rgb;
      const mixed = bg.map((c, i) => soft.rgb[i] * soft.a + c * (1 - soft.a)) as RGB;
      const r = ratio(text, mixed);
      if (r < 4.5) rows.push(`${t} sur ${s} : ${r.toFixed(2)}`);
    }
  }
  return rows;
}

describe('contraste AA des teintes sémantiques (#1531)', () => {
  it('thème clair', () => {
    const surfaces = [
      decl(design, '--color-bg'),
      decl(design, '--color-surface'),
      decl(design, '--color-surface-2'),
    ];
    expect(check(theme, theme.indexOf(':root'), surfaces)).toEqual([]);
  });

  it('thème sombre', () => {
    const from = tokens.indexOf('.theme-dark {');
    const surfaces = [
      decl(tokens, '--color-bg', from),
      decl(tokens, '--color-surface', from),
      decl(tokens, '--color-surface-2', from),
    ];
    expect(check(tokens, from, surfaces)).toEqual([]);
  });
});
