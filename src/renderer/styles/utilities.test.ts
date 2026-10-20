/**
 * Garde-fou utilities.css (#1095)
 * Tailwind n'est pas installé : toute classe utilitaire de style Tailwind
 * employée dans un composant doit être définie dans une feuille de styles,
 * sinon l'élément s'affiche sans style.
 * Licensed under GPL-3.0
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const RENDERER = path.join(__dirname, '..');
const STYLESHEETS = ['main.css', 'formula.css', 'design.css', 'tokens.css', 'utilities.css'];

// Préfixes Tailwind (avec variantes hover:, md:…) — les autres classes sont sémantiques
const UTILITY =
  /^(?:(?:hover|focus|disabled|active|md|lg|sm):)*-?(?:bg|text|border|ring|p[xytblr]?|m[xytblr]?|gap|space-[xy]|w|h|min-w|min-h|max-w|max-h|flex|grid-cols|rounded|font|items|justify|shadow|opacity|overflow|leading|tracking|whitespace|inset|top|left|right|bottom|z|divide|duration|from|to|scale|rotate|animate|outline)(?:-[\w[\]./%-]+)?$/;

function definedClasses(): Set<string> {
  const css = STYLESHEETS.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
  const set = new Set<string>();
  for (const m of css.matchAll(/\.((?:[\w-]|\\.)+)/g)) set.add(m[1].replace(/\\/g, ''));
  return set;
}

function listTsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listTsx(p);
    return e.name.endsWith('.tsx') && !e.name.includes('.test.') ? [p] : [];
  });
}

/** Contenu des attributs className="…" / className={…} (accolades équilibrées). */
function classNameChunks(src: string): string[] {
  const chunks: string[] = [];
  let i = src.indexOf('className=');
  while (i !== -1) {
    let j = i + 'className='.length;
    if (src[j] === '"') {
      const end = src.indexOf('"', j + 1);
      chunks.push(src.slice(j + 1, end));
    } else if (src[j] === '{') {
      let depth = 0;
      const start = j;
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) break;
      }
      const expr = src.slice(start + 1, j).replace(/\$\{[^}]*\}/g, ' ');
      for (const m of expr.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
        chunks.push(m[1] ?? m[2] ?? m[3] ?? '');
      }
    }
    i = src.indexOf('className=', j);
  }
  return chunks;
}

describe('utilities.css', () => {
  it('définit toutes les classes utilitaires utilisées par les composants', () => {
    const defined = definedClasses();
    const missing = new Map<string, Set<string>>();
    for (const file of listTsx(path.join(RENDERER, 'components'))) {
      const src = fs.readFileSync(file, 'utf8');
      for (const chunk of classNameChunks(src)) {
        for (const cls of chunk.split(/\s+/)) {
          if (!cls || !UTILITY.test(cls) || defined.has(cls)) continue;
          const rel = path.relative(RENDERER, file);
          if (!missing.has(cls)) missing.set(cls, new Set());
          missing.get(cls)!.add(rel);
        }
      }
    }
    const report = [...missing].map(([cls, files]) => `${cls} (${[...files].join(', ')})`);
    expect(report).toEqual([]);
  });
});
