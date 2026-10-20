/**
 * Helper partagé /common.js et analyseur des interpolations HTML non échappées (#1147).
 * Le dernier test est la barrière de non-régression : aucune page distante ne doit
 * interpoler une valeur non échappée dans un gabarit HTML.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports */
const { escHtml, html: tag } = require('./common.js') as {
  escHtml: (v: unknown) => string;
  html: ((s: TemplateStringsArray, ...v: unknown[]) => { toString(): string }) & {
    raw: (v: unknown) => unknown;
  };
};
const { analyzeRemoteSource } = require('../../scripts/remote-escape-analysis.js') as {
  analyzeRemoteSource: (file: string, text: string) => { line: number; expr: string }[];
};
/* eslint-enable @typescript-eslint/no-require-imports */

describe('escHtml (/common.js)', () => {
  it('échappe & < > " \' et `', () => {
    expect(escHtml('<img src=x onerror="a()">')).toBe('&lt;img src=x onerror=&quot;a()&quot;&gt;');
    expect(escHtml(`O'Brien & fils \`x\``)).toBe('O&#39;Brien &amp; fils &#96;x&#96;');
  });

  it('null et undefined donnent une chaîne vide, 0 reste 0', () => {
    expect(escHtml(null)).toBe('');
    expect(escHtml(undefined)).toBe('');
    expect(escHtml(0)).toBe('0');
  });
});

describe('gabarit html (/common.js)', () => {
  const h = tag;

  it('échappe les interpolations par défaut', () => {
    const name = '<b>x</b>';
    expect(String(h`<td>${name}</td>`)).toBe('<td>&lt;b&gt;x&lt;/b&gt;</td>');
  });

  it('html.raw laisse passer un fragment de confiance, les tableaux sont concaténés', () => {
    const rows = ['a', '<i>'].map(v => h`<li>${v}</li>`);
    expect(String(h`<ul>${rows}</ul>`)).toBe('<ul><li>a</li><li>&lt;i&gt;</li></ul>');
    expect(String(h`<p>${tag.raw('<b>ok</b>')}</p>`)).toBe('<p><b>ok</b></p>');
  });
});

describe('analyseur des interpolations HTML', () => {
  const analyze = (code: string) => analyzeRemoteSource('page.js', code).map(h => h.expr);

  it('signale une donnée brute dans un gabarit HTML', () => {
    expect(analyze('const a = `<td>${r.lastName}</td>`;')).toEqual(['r.lastName']);
  });

  it('accepte escHtml, esc, escapeHtml, tk, nombres et conditions entre littéraux', () => {
    expect(
      analyze(
        'const a = `<td class="${ok ? "a" : "b"}">${escHtml(r.lastName)}${esc(r.club)}${tk("k")}${Number(x)}${i + 1}</td>`;'
      )
    ).toEqual([]);
  });

  it('ignore les gabarits sans balise', () => {
    expect(analyze('el.textContent = `${r.lastName} ${r.firstName}`;')).toEqual([]);
  });

  it('accepte un fragment audité marqué par un commentaire html', () => {
    expect(analyze('const a = `<tbody>${/* html */ rows}</tbody>`;')).toEqual([]);
    expect(analyze('const a = `<tbody>${rows}</tbody>`;')).toEqual(['rows']);
  });

  it('arr.map(…).join() : seuls les gabarits internes comptent', () => {
    expect(analyze('x = `<ul>${a.map(v => `<li>${escHtml(v)}</li>`).join("")}</ul>`;')).toEqual([]);
    expect(analyze('x = `<ul>${a.map(v => `<li>${v.name}</li>`).join("")}</ul>`;')).toEqual([
      'v.name',
    ]);
  });

  it('signale une concaténation brute assignée à innerHTML', () => {
    expect(analyze('el.innerHTML = "<b>" + f.name + "</b>";')).toEqual(['f.name']);
    expect(analyze('el.innerHTML = "<b>" + escHtml(f.name) + "</b>";')).toEqual([]);
    expect(analyze('el.textContent = "x" + f.name;')).toEqual([]);
  });

  it('analyse les scripts inline des pages HTML', () => {
    const page = '<html><script>\nconst a = `<td>${x.name}</td>`;\n</script></html>';
    expect(analyzeRemoteSource('p.html', page)).toMatchObject([{ line: 2, expr: 'x.name' }]);
  });
});

describe('pages distantes (barrière de non-régression)', () => {
  it('aucune interpolation HTML non échappée dans src/remote', () => {
    const skip = new Set(['i18n.js', 'sw.js', 'common.js']);
    const findings: string[] = [];
    for (const name of fs.readdirSync(__dirname)) {
      if (!/\.(html|js)$/.test(name) || skip.has(name)) continue;
      const text = fs.readFileSync(path.join(__dirname, name), 'utf8');
      for (const h of analyzeRemoteSource(name, text)) findings.push(`${name}:${h.line} ${h.expr}`);
    }
    expect(findings).toEqual([]);
  });

  it('chaque page qui utilise escHtml charge /common.js', () => {
    for (const name of fs.readdirSync(__dirname).filter(n => n.endsWith('.html'))) {
      const text = fs.readFileSync(path.join(__dirname, name), 'utf8');
      if (/\b(escHtml|window\.escHtml)\b/.test(text)) {
        expect(text, name).toContain('<script src="/common.js"></script>');
      }
    }
  });
});
