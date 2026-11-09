/**
 * BellePoule Modern - Écran d'arène : transition de score discrète et mode écran noir / pause (#1540)
 * - Un score qui change reçoit brièvement la classe `score-changed` (fondu léger, pas de saut)
 * - Touche « B » (ou ?blackout=1) : écran noir ; toute touche / clic le rétablit
 * Chargé en <script src="/js/arenaScreen.js" data-bp-init> (CSP : pas de script inline).
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const SCORE_IDS = ['score-a', 'score-b'];
  const PULSE_MS = 600;

  /** Marque brièvement un score modifié (valeur précédente non vide, texte différent) */
  function pulseScore(el, prev, setTimer) {
    if (!el || prev === '' || prev == null || prev === el.textContent) return false;
    el.classList.add('score-changed');
    (setTimer || setTimeout)(() => el.classList.remove('score-changed'), PULSE_MS);
    return true;
  }

  /** Observe les deux scores ; renvoie l'observateur (ou null sans MutationObserver) */
  function watchScores(doc, win) {
    const MO =
      (win && win.MutationObserver) ||
      (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (!MO) return null;
    const last = {};
    SCORE_IDS.forEach(id => {
      const el = doc.getElementById(id);
      if (el) last[id] = el.textContent;
    });
    const obs = new MO(() => {
      SCORE_IDS.forEach(id => {
        const el = doc.getElementById(id);
        if (!el) return;
        const prev = last[id];
        last[id] = el.textContent;
        pulseScore(el, prev);
      });
    });
    SCORE_IDS.forEach(id => {
      const el = doc.getElementById(id);
      if (el) obs.observe(el, { childList: true, characterData: true, subtree: true });
    });
    return obs;
  }

  /** Bascule l'écran noir ; renvoie l'état. aria-hidden masque le contenu aux lecteurs d'écran. */
  function setBlackout(doc, on) {
    doc.body.classList.toggle('bp-blackout', !!on);
    doc.body.setAttribute('data-blackout', on ? '1' : '0');
    return !!on;
  }

  function isBlackout(doc) {
    return doc.body.classList.contains('bp-blackout');
  }

  function isTypingTarget(t) {
    return (
      !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable === true)
    );
  }

  /** Gestion clavier : B bascule, toute autre touche ou clic quitte l'écran noir */
  function onKey(doc, e) {
    if (isTypingTarget(e.target)) return;
    if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setBlackout(doc, !isBlackout(doc));
    } else if (isBlackout(doc)) {
      setBlackout(doc, false);
    }
  }

  function init(win) {
    const w = win || (typeof window !== 'undefined' ? window : null);
    if (!w || !w.document || !w.document.body) return null;
    const doc = w.document;
    if (!doc.querySelector('style[data-bp="arena-screen"]')) {
      const st = doc.createElement('style');
      st.setAttribute('data-bp', 'arena-screen');
      st.textContent =
        '.score-changed{animation:bp-score-fade .5s ease-out}' +
        '@keyframes bp-score-fade{from{opacity:.55}to{opacity:1}}' +
        'body.bp-blackout{background:var(--color-black) !important}' +
        'body.bp-blackout>*{visibility:hidden !important}';
      doc.head.appendChild(st);
    }
    watchScores(doc, w);
    doc.addEventListener('keydown', e => onKey(doc, e));
    doc.addEventListener('click', () => {
      if (isBlackout(doc)) setBlackout(doc, false);
    });
    if (/[?&]blackout=1/.test((w.location && w.location.search) || '')) setBlackout(doc, true);
    return true;
  }

  const api = { pulseScore, watchScores, setBlackout, isBlackout, onKey, init, PULSE_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPArenaScreen = api;
  const cs = root && root.document && root.document.currentScript;
  if (cs && cs.hasAttribute('data-bp-init')) {
    if (root.document.readyState === 'loading')
      root.document.addEventListener('DOMContentLoaded', () => init(root));
    else init(root);
  }
})(typeof window !== 'undefined' ? window : undefined);
