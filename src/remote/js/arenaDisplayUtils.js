/**
 * BellePoule Modern - Écran d'arène : utilitaires purs extraits de arena.html (#1401)
 * Bannière texte seul, identifiant d'arène, thèmes. Servi en /js/arenaDisplayUtils.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const VALID_THEMES = ['dark', 'light', 'neon', 'unicorn'];

  /** Bannière d'annonce : texte seul, jamais innerHTML (noms de tireurs non fiables, #995) */
  function setBannerLines(banner, line1, line2) {
    const doc = banner.ownerDocument;
    banner.replaceChildren();
    const d1 = doc.createElement('div');
    d1.textContent = line1;
    banner.appendChild(d1);
    if (line2) {
      const d2 = doc.createElement('div');
      d2.style.cssText = 'font-size:0.65em;font-weight:600;margin-top:0.25em;opacity:0.9;';
      d2.textContent = line2;
      banner.appendChild(d2);
    }
  }

  /** Identifiant d'arène (`arena3`) déduit du chemin /arene3 ou /arena3 ; arena1 par défaut */
  function arenaIdFromPath(pathname) {
    const match = pathname.match(/arene(\d+)/i) || pathname.match(/arena(\d+)/i);
    return match ? `arena${match[1]}` : 'arena1';
  }

  /** Applique les variables d'un thème personnalisé (feuille de style dédiée + mode overlay) */
  function applyCustomTheme(doc, customTheme) {
    let styleEl = doc.getElementById('custom-theme-style');
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'custom-theme-style';
      doc.head.appendChild(styleEl);
    }
    const vars = Object.entries(customTheme.variables || {})
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n');
    styleEl.textContent = `[data-theme="custom"] {\n${vars}\n}`;
    if (customTheme.overlayMode) doc.documentElement.setAttribute('data-overlay', 'true');
    else doc.documentElement.removeAttribute('data-overlay');
  }

  /**
   * Applique un thème et le mémorise (displayTheme).
   * @returns {string} thème effectivement appliqué ('custom' ou un thème valide)
   */
  function applyArenaTheme(doc, storage, theme, customTheme) {
    let applied;
    if (theme === 'custom' && customTheme) {
      applied = 'custom';
      doc.documentElement.setAttribute('data-theme', 'custom');
      applyCustomTheme(doc, customTheme);
    } else {
      applied = VALID_THEMES.includes(theme) ? theme : 'dark';
      doc.documentElement.setAttribute('data-theme', applied);
      doc.documentElement.removeAttribute('data-overlay');
      const existing = doc.getElementById('custom-theme-style');
      if (existing) existing.remove();
    }
    storage.setItem('displayTheme', applied);
    return applied;
  }

  const api = { setBannerLines, arenaIdFromPath, applyCustomTheme, applyArenaTheme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPArenaUtils = api;
})(typeof window !== 'undefined' ? window : undefined);
