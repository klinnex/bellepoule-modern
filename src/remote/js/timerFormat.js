/**
 * BellePoule Modern - Formatage du chrono au centième de seconde (#1416)
 * Partagé arbitre / écran d'arène / vue publique. Servi en /js/timerFormat.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /** Seuil (secondes) sous lequel les écrans d'arène/publics affichent dixièmes + centièmes */
  const TENTHS_THRESHOLD = 10;

  const pad2 = n => String(n).padStart(2, '0');

  /**
   * @param {number} timeSec temps restant en secondes (décimal possible, ex. 7.43)
   * @param {{alwaysTenths?: boolean}} [opts] alwaysTenths : arbitre (toujours affiché) ; sinon seulement ≤ 10 s
   * @returns {{main: string, tenth: string}} main = « MM:SS », tenth = « dc » (dixième + centième) ou '' (sans fraction)
   */
  function formatTimer(timeSec, opts) {
    const t = Number.isFinite(timeSec) && timeSec > 0 ? timeSec : 0;
    const cs = Math.round(t * 100);
    const showFrac = (opts && opts.alwaysTenths) || cs <= TENTHS_THRESHOLD * 100;
    // Sans fraction : arrondi supérieur (compte à rebours classique) ; avec : seconde entière écoulée
    const secs = showFrac ? Math.floor(cs / 100) : Math.ceil(cs / 100);
    return {
      main: `${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}`,
      tenth: showFrac ? pad2(cs % 100) : '',
    };
  }

  /** Écrit le chrono dans un élément : « MM:SS » + <span class="timer-tenths">.dc</span> (texte seul) */
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

  /** Chrono interne en centièmes (`_timerCs`) ; `timerSeconds` = secondes entières restantes (arrondi sup.) */
  function withTenths(proto) {
    Object.defineProperty(proto, 'timerSeconds', {
      configurable: true,
      get() {
        return Math.ceil(this._timerCs / 100);
      },
      set(v) {
        this._timerCs = Math.max(0, Math.round(v * 100));
      },
    });
  }

  /**
   * Écrans arène/public : interpolation locale entre deux diffusions de l'arbitre,
   * pour que dixièmes et centièmes s'écoulent comme un vrai chronomètre.
   * @param {(t: number) => void} render appelé avec le temps restant (s)
   * @param {{now?: () => number, raf?: (cb: () => void) => any, caf?: (id: any) => void}} [deps]
   */
  function createSmoothTimer(render, deps) {
    const d = deps || {};
    const now = d.now || (() => Date.now());
    const raf = d.raf || (cb => setTimeout(cb, 16));
    const caf = d.caf || (id => clearTimeout(id));
    let base = 0;
    let at = 0;
    let running = false;
    let handle = null;
    const current = () => (running ? Math.max(0, base - (now() - at) / 1000) : base);
    function loop() {
      handle = null;
      if (!running) return;
      const t = current();
      render(t);
      if (t > 0) handle = raf(loop);
    }
    return {
      /** Nouvelle valeur reçue : repart de ce temps ; anime seulement en marche sous le seuil */
      update(timeSec, status) {
        base = Number.isFinite(timeSec) && timeSec > 0 ? timeSec : 0;
        at = now();
        running = status === 'running' && base > 0 && base <= TENTHS_THRESHOLD + 1;
        if (handle !== null) caf(handle);
        handle = null;
        render(base);
        if (running) handle = raf(loop);
      },
      stop() {
        running = false;
        if (handle !== null) caf(handle);
        handle = null;
      },
      current,
    };
  }

  const api = { formatTimer, renderTimer, withTenths, createSmoothTimer, TENTHS_THRESHOLD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPTimer = api;
})(typeof window !== 'undefined' ? window : undefined);
