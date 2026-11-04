/**
 * BellePoule Modern - Formatage du chrono au dixième de seconde (#1416)
 * Partagé arbitre / écran d'arène / vue publique. Servi en /js/timerFormat.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /** Seuil (secondes) sous lequel les écrans d'arène/publics affichent les dixièmes */
  const TENTHS_THRESHOLD = 10;

  const pad2 = n => String(n).padStart(2, '0');

  /**
   * @param {number} timeSec temps restant en secondes (décimal possible, ex. 7.4)
   * @param {{alwaysTenths?: boolean}} [opts] alwaysTenths : arbitre (toujours affiché) ; sinon seulement ≤ 10 s
   * @returns {{main: string, tenth: string}} main = « MM:SS », tenth = chiffre 0-9 ou '' (sans dixième)
   */
  function formatTimer(timeSec, opts) {
    const t = Number.isFinite(timeSec) && timeSec > 0 ? timeSec : 0;
    const tenths = Math.round(t * 10);
    const showTenths = (opts && opts.alwaysTenths) || tenths <= TENTHS_THRESHOLD * 10;
    // Sans dixième : arrondi supérieur (compte à rebours classique) ; avec : seconde entière écoulée
    const secs = showTenths ? Math.floor(tenths / 10) : Math.ceil(tenths / 10);
    return {
      main: `${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}`,
      tenth: showTenths ? String(tenths % 10) : '',
    };
  }

  /** Écrit le chrono dans un élément : « MM:SS » + <span class="timer-tenths">.x</span> (texte seul) */
  function renderTimer(el, timeSec, opts) {
    const { main, tenth } = formatTimer(timeSec, opts);
    el.textContent = main;
    if (tenth !== '') {
      const span = el.ownerDocument.createElement('span');
      span.className = 'timer-tenths';
      span.style.fontSize = '0.5em'; // moitié de la taille des secondes
      span.style.letterSpacing = '0';
      span.textContent = '.' + tenth;
      el.appendChild(span);
    }
  }

  /** Chrono interne en dixièmes (`_timerTenths`) ; `timerSeconds` = secondes entières restantes (arrondi sup.) */
  function withTenths(proto) {
    Object.defineProperty(proto, 'timerSeconds', {
      configurable: true,
      get() {
        return Math.ceil(this._timerTenths / 10);
      },
      set(v) {
        this._timerTenths = Math.max(0, Math.round(v * 10));
      },
    });
  }

  const api = { formatTimer, renderTimer, withTenths, TENTHS_THRESHOLD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPTimer = api;
})(typeof window !== 'undefined' ? window : undefined);
