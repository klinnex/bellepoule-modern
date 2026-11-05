/**
 * BellePoule Modern - Démo autonome : liste et disposition des écrans (logique pure, testable)
 * Licensed under GPL-3.0
 */

export interface DemoScreen {
  /** Titre de la fenêtre */
  title: string;
  url: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Écrans montrés par la démo : affichage de chaque arène (max 2), tablette arène 1, kiosque. */
export function demoScreens(serverUrl: string, strips: number): DemoScreen[] {
  const base = serverUrl.replace(/\/+$/, '');
  const arenas = Math.max(1, Math.min(strips, 2));
  const list: DemoScreen[] = [];
  for (let i = 1; i <= arenas; i++) list.push({ title: `Arène ${i}`, url: `${base}/arene${i}` });
  list.push({ title: 'Tablette arbitre — Arène 1', url: `${base}/arene1/arbitre` });
  list.push({ title: 'Kiosque', url: `${base}/kiosk` });
  return list;
}

/** Mosaïque sur la zone de travail : 2 colonnes, autant de lignes que nécessaire. */
export function tileLayout(count: number, area: Rect): Rect[] {
  if (count <= 0) return [];
  const cols = count === 1 ? 1 : 2;
  const rows = Math.ceil(count / cols);
  const w = Math.floor(area.width / cols);
  const h = Math.floor(area.height / rows);
  return Array.from({ length: count }, (_, i) => ({
    x: area.x + (i % cols) * w,
    y: area.y + Math.floor(i / cols) * h,
    width: w,
    height: h,
  }));
}
