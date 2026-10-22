/**
 * Garde-fou styles dupliqués (#1098)
 * design.css est importé après main.css (index.tsx) : toute déclaration de main.css
 * redéfinie par design.css pour le même sélecteur, dans le même contexte @media,
 * est du code mort. design.css est la source unique pour ces composants.
 * Licensed under GPL-3.0
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import postcss, { type Node, type Rule } from 'postcss';

const read = (f: string) => postcss.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function context(node: Node): string {
  const parts: string[] = [];
  for (let p = node.parent; p && p.type !== 'root'; p = p.parent) {
    if (p.type === 'atrule') {
      const a = p as unknown as { name: string; params: string };
      parts.unshift(`@${a.name} ${norm(a.params)}`);
    }
  }
  return parts.join(' > ');
}

const inKeyframes = (rule: Rule) =>
  rule.parent?.type === 'atrule' &&
  /keyframes$/.test((rule.parent as { name?: string }).name ?? '');

describe('main.css / design.css', () => {
  it('index.tsx importe design.css après main.css', () => {
    const index = fs.readFileSync(path.join(__dirname, '..', 'index.tsx'), 'utf8');
    expect(index.indexOf("'./styles/main.css'")).toBeGreaterThan(-1);
    expect(index.indexOf("'./styles/design.css'")).toBeGreaterThan(
      index.indexOf("'./styles/main.css'")
    );
  });

  it('aucune déclaration de main.css écrasée par design.css', () => {
    const design = new Map<string, Map<string, boolean>>();
    read('design.css').walkRules(rule => {
      if (inKeyframes(rule)) return;
      for (const sel of rule.selectors.map(norm)) {
        const key = `${context(rule)}|${sel}`;
        const props = design.get(key) ?? new Map<string, boolean>();
        rule.walkDecls(d => {
          if (d.parent === rule) props.set(d.prop, (props.get(d.prop) ?? false) || d.important);
        });
        design.set(key, props);
      }
    });

    const dead: string[] = [];
    read('main.css').walkRules(rule => {
      if (inKeyframes(rule)) return;
      const maps = rule.selectors.map(sel => design.get(`${context(rule)}|${norm(sel)}`));
      if (maps.some(m => !m)) return;
      rule.walkDecls(d => {
        if (d.parent !== rule) return;
        if (maps.every(m => m!.has(d.prop) && (!d.important || m!.get(d.prop)))) {
          dead.push(`${norm(rule.selector)} { ${d.prop} } (main.css:${d.source?.start?.line})`);
        }
      });
    });
    expect(dead).toEqual([]);
  });
});
