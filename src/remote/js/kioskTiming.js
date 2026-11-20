/**
 * BellePoule Modern - Kiosque : rotation des vues, reprise réseau et défilement automatique
 * (extrait de kiosk.html #1401). Horloge, rAF et minuteries injectés. Servi en /js/kioskTiming.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /** Délai de reprise après échec : backoff exponentiel 1 s → 30 s, jitter ±25 % (random dans [0,1[) */
  function retryDelay(attempt, random) {
    return Math.min(30000, 1000 * 2 ** attempt) * (0.75 + random * 0.5);
  }

  /** Vue suivante dans la liste (circulaire) ; première vue si l'actuelle est inconnue */
  function nextView(views, current) {
    const idx = views.indexOf(current);
    return views[(idx + 1) % views.length];
  }

  /** Avancement (0-100) de la barre de rotation */
  function progressPct(elapsedMs, rotationMs) {
    return Math.min(100, (elapsedMs / rotationMs) * 100);
  }

  /**
   * Défilement vers le bas puis, s'il y a eu défilement, reprise du début après 3 s (#1036).
   * @param {{raf, caf, setTimeout, clearTimeout}} env primitives de temporisation
   */
  function createAutoScroller(env) {
    const DURATION = 20000; // ms pour parcourir tout le contenu
    let animFrame = null;
    let delayTimer = null;

    function stop() {
      env.caf(animFrame);
      env.clearTimeout(delayTimer);
    }

    function start(wrapper) {
      stop();
      let t0 = null;

      function step(now) {
        if (t0 === null) t0 = now;
        const maxScroll = wrapper.scrollHeight - wrapper.clientHeight;
        if (maxScroll <= 0) return;

        const progress = Math.min(1, (now - t0) / DURATION);
        wrapper.scrollTop = progress * maxScroll;

        if (progress < 1) {
          animFrame = env.raf(step);
          return;
        }
        delayTimer = env.setTimeout(() => {
          wrapper.scrollTop = 0;
          start(wrapper);
        }, 3000);
      }

      delayTimer = env.setTimeout(() => {
        animFrame = env.raf(step);
      }, 2000);
    }

    return { start, stop };
  }

  const api = { retryDelay, nextView, progressPct, createAutoScroller };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KioskTiming = api;
})(typeof window !== 'undefined' ? window : undefined);
