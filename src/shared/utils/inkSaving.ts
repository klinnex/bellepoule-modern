/**
 * BellePoule Modern - Économie d'encre à l'impression (Paramètres → Documents)
 * Retire les fonds colorés, passe le texte et les traits en noir, et les images en niveaux de gris.
 * Appliqué au HTML juste avant le rendu PDF ou l'impression (processus principal).
 * Licensed under GPL-3.0
 */

/** CSS injecté : tout fond retiré (blanc), couleurs ramenées au noir, images en niveaux de gris */
export const INK_SAVING_CSS = `
  /* Économie d'encre : fonds retirés, texte et traits en noir */
  html, body { background: #fff !important; }
  *, *::before, *::after {
    background: transparent !important;
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
    color: #000 !important;
    border-color: #000 !important;
  }
  img, svg { filter: grayscale(100%) !important; }
`;

/** Marqueur du style injecté : évite une double application */
const MARKER = 'data-ink-saving';

/**
 * Insère la feuille d'économie d'encre avant `</head>` (en tête du document sinon).
 * Ajout seul : aucun contenu n'est retiré du HTML. Idempotent.
 */
export function applyInkSaving(html: string): string {
  if (html.includes(MARKER)) return html;
  const style = `<style ${MARKER}>${INK_SAVING_CSS}</style>`;
  const headEnd = html.search(/<\/head>/i);
  if (headEnd >= 0) return html.slice(0, headEnd) + style + html.slice(headEnd);
  return style + html;
}
