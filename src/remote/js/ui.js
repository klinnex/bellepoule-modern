/**
 * BellePoule Modern - Composants et thème communs aux pages distantes (#1538)
 * Bouton, carte, badge de statut de match, barre de score, en-tête, pied de page, thème
 * clair/sombre. Les couleurs viennent de /tokens.css (aucune valeur en dur). Servi en
 * /js/ui.js (CSP 'self'). Toute donnée dynamique passe par escHtml (/common.js).
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const esc = s =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  /** Statut de match → [classe, variable de couleur] */
  const STATUS = {
    live: ['live', '--green-500'],
    current: ['live', '--green-500'],
    finished: ['finished', '--slate-400'],
    scheduled: ['scheduled', '--blue-500'],
    next: ['scheduled', '--blue-500'],
    pending: ['pending', '--slate-500'],
    cancelled: ['cancelled', '--red-500'],
  };

  const BUTTON_VARIANTS = ['primary', 'secondary', 'danger'];

  const CSS = `
.bp-btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;min-height:44px;padding:.6rem 1.1rem;border:1px solid transparent;border-radius:var(--radius-md);font:inherit;font-weight:600;cursor:pointer}
.bp-btn--primary{background:var(--color-primary);color:var(--color-on-primary)}
.bp-btn--secondary{background:var(--color-surface-2);color:var(--color-text);border-color:var(--color-border-dark)}
.bp-btn--danger{background:var(--color-danger);color:var(--color-white)}
.bp-btn:disabled{opacity:.5;cursor:not-allowed}
.bp-card{background:var(--color-surface);color:var(--color-text);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:var(--shadow);padding:1rem}
.bp-badge{display:inline-block;padding:.1rem .6rem;border-radius:var(--radius-full);font-size:.75rem;font-weight:700;color:var(--color-white);background:var(--slate-500)}
.bp-badge--live{background:var(--green-500)}
.bp-badge--finished{background:var(--slate-400)}
.bp-badge--scheduled{background:var(--blue-500)}
.bp-badge--cancelled{background:var(--red-500)}
.bp-scorebar{display:flex;height:.6rem;border-radius:var(--radius-full);overflow:hidden;background:var(--color-border)}
.bp-scorebar>span:first-child{background:var(--green-500)}
.bp-scorebar>span:last-child{background:var(--red-500)}
.bp-header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem 1rem;background:var(--gradient-brand);color:var(--color-white)}
.bp-header h1{font-size:1.1rem;margin:0}
.bp-footer{padding:.5rem 1rem;text-align:center;font-size:.75rem;color:var(--color-text-muted)}
`;

  /** @returns {string} <button> ; variant ∈ primary | secondary | danger ; attrs = attributs data-/aria- déjà sûrs */
  function button(label, variant, attrs) {
    const v = BUTTON_VARIANTS.includes(variant) ? variant : 'primary';
    return `<button type="button" class="bp-btn bp-btn--${v}"${attrs ? ' ' + attrs : ''}>${esc(label)}</button>`;
  }

  /** @param {string} innerHtml contenu HTML déjà échappé par l'appelant */
  function card(innerHtml) {
    return `<div class="bp-card">${innerHtml}</div>`;
  }

  /** Pastille de statut de match (live, finished, scheduled, pending, cancelled) */
  function statusBadge(status, label) {
    const cls = (STATUS[status] || STATUS.pending)[0];
    return `<span class="bp-badge bp-badge--${cls}">${esc(label == null ? status : label)}</span>`;
  }

  /** Barre de score : parts proportionnelles de a et b (0 si aucun point) */
  function scoreBar(a, b) {
    const na = Math.max(0, Number(a) || 0);
    const nb = Math.max(0, Number(b) || 0);
    const total = na + nb;
    const pa = total ? Math.round((na / total) * 100) : 50;
    return `<div class="bp-scorebar" role="img" aria-label="${na} - ${nb}"><span style="width:${pa}%"></span><span style="width:${100 - pa}%"></span></div>`;
  }

  /** En-tête commun : titre (échappé) + zone droite (HTML déjà échappé) */
  function header(title, rightHtml) {
    return `<header class="bp-header"><h1>${esc(title)}</h1><div>${rightHtml || ''}</div></header>`;
  }

  /** Pied de page commun */
  function footer(text) {
    return `<footer class="bp-footer">${esc(text)}</footer>`;
  }

  // ── Thème clair / sombre partagé ─────────────────────────────────────────
  const THEME_KEY = 'bp_theme';

  function getTheme(doc, storage, prefersDark) {
    let saved = null;
    try {
      saved = storage && storage.getItem(THEME_KEY);
    } catch (e) {
      saved = null;
    }
    if (saved === 'dark' || saved === 'light') return saved;
    return prefersDark ? 'dark' : 'light';
  }

  /** Applique le thème : classe `theme-dark` (tokens.css) + attribut data-theme-mode */
  function applyTheme(doc, theme) {
    const dark = theme === 'dark';
    doc.documentElement.classList.toggle('theme-dark', dark);
    doc.documentElement.setAttribute('data-theme-mode', dark ? 'dark' : 'light');
    return dark ? 'dark' : 'light';
  }

  function setTheme(doc, storage, theme) {
    try {
      if (storage) storage.setItem(THEME_KEY, theme === 'dark' ? 'dark' : 'light');
    } catch (e) {
      /* stockage indisponible : thème valable pour la session seulement */
    }
    return applyTheme(doc, theme);
  }

  /** Injecte la feuille des composants (une seule fois) et applique le thème enregistré */
  function init(win) {
    const w = win || (typeof window !== 'undefined' ? window : null);
    if (!w || !w.document) return null;
    const doc = w.document;
    if (!doc.querySelector('style[data-bp="ui"]')) {
      const st = doc.createElement('style');
      st.setAttribute('data-bp', 'ui');
      st.textContent = CSS;
      doc.head.appendChild(st);
    }
    let storage = null;
    try {
      storage = w.localStorage;
    } catch (e) {
      storage = null;
    }
    const prefers = !!(w.matchMedia && w.matchMedia('(prefers-color-scheme: dark)').matches);
    return applyTheme(doc, getTheme(doc, storage, prefers));
  }

  const api = {
    button,
    card,
    statusBadge,
    scoreBar,
    header,
    footer,
    getTheme,
    applyTheme,
    setTheme,
    init,
    CSS,
    THEME_KEY,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPUI = api;
  // Auto-initialisation : <script src="/js/ui.js" data-bp-init></script> (sans script inline)
  if (
    root &&
    root.document &&
    root.document.currentScript &&
    root.document.currentScript.hasAttribute('data-bp-init')
  ) {
    const run = () => init(root);
    if (root.document.readyState === 'loading')
      root.document.addEventListener('DOMContentLoaded', run);
    else run();
  }
})(typeof window !== 'undefined' ? window : undefined);
