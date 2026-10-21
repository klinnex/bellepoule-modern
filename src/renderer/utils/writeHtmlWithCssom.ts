/**
 * Écrit un document HTML dans une iframe about:blank qui hérite de la CSP du renderer
 * (style-src sans 'unsafe-inline', #1157) : les blocs <style> et attributs style="…"
 * y sont bloqués. On les réapplique par CSSOM, que la CSP n'interdit pas.
 */
export function writeHtmlWithCssom(doc: Document, html: string): void {
  doc.open();
  doc.write(html);
  doc.close();

  const win = doc.defaultView as (Window & typeof globalThis) | null;
  const styleEls = Array.from(doc.querySelectorAll('style'));
  if (win && typeof win.CSSStyleSheet === 'function' && 'adoptedStyleSheets' in doc) {
    const sheets = styleEls.map(el => {
      const sheet = new win.CSSStyleSheet();
      sheet.replaceSync(el.textContent ?? '');
      return sheet;
    });
    doc.adoptedStyleSheets = sheets;
  }

  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[style]'))) {
    const css = el.getAttribute('style') ?? '';
    el.removeAttribute('style');
    el.style.cssText = css;
  }
}
