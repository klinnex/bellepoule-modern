/**
 * Géométrie de la minimap du tableau (#1542) : pur calcul, sans DOM.
 * Repère « contenu » = pixels du bracket non zoomé ; pan en pixels écran.
 */

export interface MinimapInput {
  contentW: number;
  contentH: number;
  viewW: number;
  viewH: number;
  zoom: number;
  pan: { x: number; y: number };
  /** Largeur de la minimap en pixels */
  mapW: number;
}

export interface MinimapLayout {
  scale: number;
  mapH: number;
  /** Rectangle visible, en pixels de minimap */
  view: { x: number; y: number; w: number; h: number };
  /** true si tout le bracket est déjà visible (minimap inutile) */
  fullyVisible: boolean;
}

export function computeMinimap(i: MinimapInput): MinimapLayout | null {
  if (i.contentW <= 0 || i.contentH <= 0 || i.viewW <= 0 || i.viewH <= 0 || i.zoom <= 0) {
    return null;
  }
  const scale = i.mapW / i.contentW;
  const visW = i.viewW / i.zoom;
  const visH = i.viewH / i.zoom;
  const visX = -i.pan.x / i.zoom + 0; // + 0 : évite -0
  const visY = -i.pan.y / i.zoom + 0;
  return {
    scale,
    mapH: i.contentH * scale,
    view: { x: visX * scale, y: visY * scale, w: visW * scale, h: visH * scale },
    fullyVisible: visW >= i.contentW && visH >= i.contentH && visX <= 0 && visY <= 0,
  };
}

/** Pan (pixels écran) qui centre la vue sur le point (mx, my) de la minimap */
export function panForMinimapPoint(
  mx: number,
  my: number,
  i: Pick<MinimapInput, 'viewW' | 'viewH' | 'zoom'>,
  scale: number
): { x: number; y: number } {
  const cx = mx / scale;
  const cy = my / scale;
  return {
    x: -(cx - i.viewW / i.zoom / 2) * i.zoom,
    y: -(cy - i.viewH / i.zoom / 2) * i.zoom,
  };
}
