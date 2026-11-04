/**
 * Module arbitre /js/refereeFaults.js (#1401) : motifs de faute, cartons de passivité.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const F = req('./refereeFaults.js');

type Group = { group: number; labelKey: string; faults: { key: string; fr: string }[] };

describe('refereeFaults.js', () => {
  it('chaque groupe a une clé de libellé et des fautes avec key + fr', () => {
    for (const list of [F.FAULT_REASONS, F.FAULT_REASONS_OLYMPIC] as Group[][]) {
      expect(list.length).toBeGreaterThan(0);
      for (const g of list) {
        expect(g.labelKey).toMatch(/^referee\./);
        expect(g.faults.length).toBeGreaterThan(0);
        for (const f of g.faults) {
          expect(f.key).toMatch(/^referee\.fault_/);
          expect(f.fr.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('clés de faute uniques et groupes olympiques 2-3', () => {
    const keys = [...F.FAULT_REASONS, ...F.FAULT_REASONS_OLYMPIC].flatMap((g: Group) =>
      g.faults.map(f => f.key)
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(F.FAULT_REASONS_OLYMPIC.map((g: Group) => g.group)).toEqual([2, 3]);
  });

  it('cartons de passivité vs standard', () => {
    expect(F.PASSIVITY_CARDS).toEqual(['p-red', 'p-black']);
    expect(F.isStandardCard('yellow')).toBe(true);
    expect(F.isStandardCard('p-red')).toBe(false);
  });

  it('lastIndexWhere', () => {
    expect(F.lastIndexWhere([1, 2, 3, 2], (x: number) => x === 2)).toBe(3);
    expect(F.lastIndexWhere([1], (x: number) => x === 9)).toBe(-1);
    expect(F.lastIndexWhere([], () => true)).toBe(-1);
  });

  it('referee.html charge le module et ne redéfinit plus les constantes', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'referee.html'), 'utf8');
    expect(html).toContain('<script src="/js/refereeFaults.js"></script>');
    expect(html).not.toContain('const FAULT_REASONS');
    expect(html).not.toContain('const PASSIVITY_CARDS');
  });
});
