/**
 * BellePoule Modern - Mannequin des zones de touche Sabre Laser, partagé entre l'écran
 * (TouchZoneHeatmap) et les exports PDF.
 * Règlement : A = main + manche du sabre (1 pt), B = bras ou jambe (3 pts), C = tronc ou tête (5 pts).
 * Une couleur par zone ; intensité selon le rang : foncé = zone la plus sollicitée,
 * moyen = intermédiaire, clair = la plus faible, gris = aucune touche.
 * Licensed under GPL-3.0
 */

export type TouchZone = 'a' | 'b' | 'c';
export type ZoneShade = 'dark' | 'medium' | 'light' | 'none';
export type FigureVariant = 'given' | 'received';

/** Teintes par zone (légende écran : styles/analytics.css, mêmes valeurs) */
export const ZONE_HUES: Record<TouchZone, Record<Exclude<ZoneShade, 'none'>, string>> = {
  a: { dark: '#b45309', medium: '#f59e0b', light: '#fde68a' },
  b: { dark: '#047857', medium: '#10b981', light: '#a7f3d0' },
  c: { dark: '#6d28d9', medium: '#8b5cf6', light: '#ddd6fe' },
};
/** Texte lisible sur chaque teinte (légende) */
export const ZONE_TEXT: Record<TouchZone, Record<Exclude<ZoneShade, 'none'>, string>> = {
  a: { dark: '#ffffff', medium: '#451a03', light: '#78350f' },
  b: { dark: '#ffffff', medium: '#022c22', light: '#064e3b' },
  c: { dark: '#ffffff', medium: '#ffffff', light: '#4c1d95' },
};
export const ZONE_POINTS: Record<TouchZone, number> = { a: 1, b: 3, c: 5 };
const NONE_FILL = '#f3f4f6';
const NONE_STROKE = '#d1d5db';
const NONE_TEXT = '#6b7280';
const BLADE = '#9ca3af';

/** Rang de la zone parmi les trois : la plus touchée = foncé, la moins touchée = clair. */
export function zoneShade(count: number, counts: number[]): ZoneShade {
  if (count <= 0) return 'none';
  const positive = counts.filter(c => c > 0);
  if (count === Math.max(...positive)) return 'dark';
  if (count === Math.min(...positive)) return 'light';
  return 'medium';
}

export interface ZonePaint {
  shade: ZoneShade;
  fill: string;
  stroke: string;
  text: string;
}

/** Couleurs des trois zones pour des compteurs [A, B, C]. */
export function zonePaints(counts: [number, number, number]): Record<TouchZone, ZonePaint> {
  const paint = (z: TouchZone, count: number): ZonePaint => {
    const shade = zoneShade(count, counts);
    if (shade === 'none') return { shade, fill: NONE_FILL, stroke: NONE_STROKE, text: NONE_TEXT };
    return {
      shade,
      fill: ZONE_HUES[z][shade],
      stroke: ZONE_HUES[z].dark,
      text: ZONE_TEXT[z][shade],
    };
  };
  return { a: paint('a', counts[0]), b: paint('b', counts[1]), c: paint('c', counts[2]) };
}

export const FIGURE_VIEWBOX = '0 0 80 124';

/**
 * Formes du mannequin. `paint` : 'zone' = remplissage + contour de la zone,
 * 'hilt' = trait épais couleur de zone (manche), 'guard' = trait contour (garde), 'blade' = lame.
 */
export interface FigureShape {
  tag: 'ellipse' | 'rect' | 'circle' | 'line';
  zone: TouchZone | null;
  paint: 'zone' | 'hilt' | 'guard' | 'blade';
  attrs: Record<string, number>;
}

export const FIGURE_SHAPES: FigureShape[] = [
  // Zone C — tête et tronc
  { tag: 'ellipse', zone: 'c', paint: 'zone', attrs: { cx: 30, cy: 11, rx: 9, ry: 9 } },
  { tag: 'rect', zone: 'c', paint: 'zone', attrs: { x: 18, y: 23, width: 24, height: 54, rx: 5 } },
  // Zone B — bras et jambes
  { tag: 'rect', zone: 'b', paint: 'zone', attrs: { x: 6, y: 25, width: 10, height: 33, rx: 4 } },
  { tag: 'rect', zone: 'b', paint: 'zone', attrs: { x: 44, y: 25, width: 10, height: 33, rx: 4 } },
  { tag: 'rect', zone: 'b', paint: 'zone', attrs: { x: 18, y: 79, width: 11, height: 40, rx: 4 } },
  { tag: 'rect', zone: 'b', paint: 'zone', attrs: { x: 31, y: 79, width: 11, height: 40, rx: 4 } },
  // Lame (hors zone)
  { tag: 'line', zone: null, paint: 'blade', attrs: { x1: 56, y1: 56, x2: 77, y2: 8 } },
  // Zone A — mains + manche du sabre
  { tag: 'circle', zone: 'a', paint: 'zone', attrs: { cx: 11, cy: 63, r: 5 } },
  { tag: 'line', zone: 'a', paint: 'hilt', attrs: { x1: 46, y1: 72, x2: 56, y2: 56 } },
  { tag: 'line', zone: 'a', paint: 'guard', attrs: { x1: 51, y1: 55, x2: 60, y2: 60 } },
  { tag: 'circle', zone: 'a', paint: 'zone', attrs: { cx: 49, cy: 63, r: 5 } },
];

/** Attributs de peinture d'une forme (noms SVG en camelCase pour React). */
export function shapePaint(
  shape: FigureShape,
  paints: Record<TouchZone, ZonePaint>
): Record<string, string | number> {
  if (shape.paint === 'blade') return { stroke: BLADE, strokeWidth: 2, strokeLinecap: 'round' };
  const p = paints[shape.zone!];
  if (shape.paint === 'hilt') return { stroke: p.fill, strokeWidth: 5, strokeLinecap: 'round' };
  if (shape.paint === 'guard') return { stroke: p.stroke, strokeWidth: 1.5 };
  return { fill: p.fill, stroke: p.stroke, strokeWidth: 1.2 };
}

const kebab = (k: string) => k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);

/** Mannequin en SVG (chaîne) pour les exports HTML / PDF. */
export function touchZoneFigureSvg(
  counts: [number, number, number],
  size: { width: number; height: number } = { width: 100, height: 155 },
  ariaLabel = ''
): string {
  const paints = zonePaints(counts);
  const body = FIGURE_SHAPES.map(sh => {
    const attrs = { ...sh.attrs, ...shapePaint(sh, paints) };
    const str = Object.entries(attrs)
      .map(([k, v]) => `${kebab(k)}="${v}"`)
      .join(' ');
    return `<${sh.tag} ${str}/>`;
  }).join('');
  const label = ariaLabel.replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${FIGURE_VIEWBOX}" width="${size.width}" height="${size.height}" role="img" aria-label="${label}">${body}</svg>`;
}
