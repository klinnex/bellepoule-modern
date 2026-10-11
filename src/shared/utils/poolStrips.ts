/**
 * BellePoule Modern - Attribution des pistes aux poules
 * Même règle que le serveur de saisie distante : pool.strip si défini,
 * sinon première piste libre dans l'ordre des poules.
 * Licensed under GPL-3.0
 */

export interface PoolStripInput {
  id: string;
  number: number;
  strip?: number | null;
}

export function computePoolStrips(
  pools: PoolStripInput[],
  arenaCount: number
): Map<string, number> {
  const result = new Map<string, number>();
  const used = new Set<number>();
  const sorted = [...pools].sort((a, b) => a.number - b.number);
  for (const p of sorted) {
    const s = Number(p.strip);
    if (Number.isInteger(s) && s > 0 && s <= arenaCount) {
      result.set(p.id, s);
      used.add(s);
    }
  }
  let next = 1;
  for (const p of sorted) {
    if (result.has(p.id)) continue;
    while (used.has(next)) next++;
    if (next > arenaCount) break;
    result.set(p.id, next);
    used.add(next);
  }
  return result;
}
