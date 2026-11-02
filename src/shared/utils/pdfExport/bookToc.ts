/**
 * BellePoule Modern - Dossier de compétition : page de garde + sommaire (#1325)
 * Licensed under GPL-3.0
 */

export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Pages occupées par la page de garde et le sommaire, avant la première section */
export const BOOK_FRONT_PAGES = 2;

/** Première page de chaque section, à partir du nombre de pages de chacune. */
export function computeStartPages(pageCounts: number[], frontPages = BOOK_FRONT_PAGES): number[] {
  const starts: number[] = [];
  let next = frontPages + 1;
  for (const n of pageCounts) {
    starts.push(next);
    next += Math.max(1, n);
  }
  return starts;
}

export interface BookFrontInput {
  competitionTitle: string;
  toc: { title: string }[];
  /** Pages de chaque section ; absent → sommaire sans numéros */
  pageCounts?: number[];
  labels: { contents: string; page: string };
  logo?: string;
}

/** HTML de la page de garde et du sommaire (deux pages). */
export function buildBookFrontHTML(input: BookFrontInput): string {
  const { competitionTitle, toc, pageCounts, labels, logo } = input;
  const starts =
    pageCounts && pageCounts.length === toc.length ? computeStartPages(pageCounts) : null;
  const logoTag =
    logo && logo.startsWith('data:image/')
      ? `<img class="book-logo" src="${escHtml(logo)}" alt="">`
      : '';
  const rows = toc
    .map(
      (e, i) =>
        `<li><span class="book-toc-title">${escHtml(e.title)}</span>${
          starts ? `<span class="book-toc-page">${labels.page} ${starts[i]}</span>` : ''
        }</li>`
    )
    .join('\n');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
.book-cover { height: 250mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; font-family: sans-serif; }
.book-cover h1 { font-size: 32pt; margin: 12mm 0 0; }
.book-logo { max-height: 60mm; max-width: 120mm; }
.book-toc-break { break-before: page; }
.book-toc { font-family: sans-serif; padding: 15mm; }
.book-toc ol { list-style: none; padding: 0; }
.book-toc li { display: flex; justify-content: space-between; border-bottom: 1px dotted #888; padding: 2mm 0; }
</style></head><body>
<div class="book-cover">${logoTag}<h1>${escHtml(competitionTitle)}</h1></div>
<div class="book-toc-break"></div>
<div class="book-toc"><h2>${escHtml(labels.contents)}</h2><ol>
${rows}
</ol></div>
</body></html>`;
}
