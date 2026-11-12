/**
 * BellePoule Modern - Garde de redimensionnement (#1652) : pendant un redimensionnement manuel
 * (bord de fenêtre, dispositions Windows 11), Chromium recompose la page à chaque frame. Le flou
 * `backdrop-filter` de l'en-tête collant et des menus, plus les animations infinies, saturent
 * alors le GPU et le compositeur (DWM) : lag de tout le bureau. On pose `data-resizing` sur
 * <html> pendant le geste (styles/resize-guard.css coupe flou, animations, transitions) et on
 * le retire après une courte inactivité. « Agrandir » n'émet qu'un événement : coût nul.
 * Licensed under GPL-3.0
 */

export const RESIZE_IDLE_MS = 200;
export const RESIZING_ATTR = 'data-resizing';

export function installResizeGuard(
  win: Window = window,
  root: HTMLElement = document.documentElement,
  idleMs: number = RESIZE_IDLE_MS
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const end = () => {
    timer = undefined;
    root.removeAttribute(RESIZING_ATTR);
  };
  const onResize = () => {
    if (timer === undefined) root.setAttribute(RESIZING_ATTR, '');
    else clearTimeout(timer);
    timer = setTimeout(end, idleMs);
  };
  win.addEventListener('resize', onResize, { passive: true });
  return () => {
    win.removeEventListener('resize', onResize);
    if (timer !== undefined) clearTimeout(timer);
    end();
  };
}
