/**
 * BellePoule Modern - Tirage du tireur prioritaire (minute prioritaire, #1442)
 * Le cadre doré passe d'un tireur à l'autre en ralentissant, puis se fixe au bout de ~3 s.
 * Partagé arbitre / écran d'arène / vue publique. Servi en /js/priorityDraw.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const DURATION_MS = 3000;

  /** Délais successifs (ms) : départ rapide, ralentissement progressif, total ≈ durationMs */
  function drawSchedule(durationMs) {
    const total = durationMs || DURATION_MS;
    const delays = [];
    let d = 70;
    let sum = 0;
    while (sum + d < total) {
      delays.push(d);
      sum += d;
      d = Math.round(d * 1.12);
    }
    delays.push(Math.max(0, total - sum));
    return delays;
  }

  /**
   * @param {(side: 'A'|'B'|null) => void} apply pose le cadre doré sur un côté
   * @param {'A'|'B'} winner côté tiré (fixé à la fin)
   * @param {{durationMs?: number, setTimeout?: Function, onDone?: () => void}} [opts]
   * @returns {() => void} annulation
   */
  function animatePriorityDraw(apply, winner, opts) {
    const o = opts || {};
    const st = o.setTimeout || setTimeout;
    const delays = drawSchedule(o.durationMs);
    const other = winner === 'A' ? 'B' : 'A';
    // Parité choisie pour que la dernière étape tombe sur le vainqueur
    let side = delays.length % 2 === 0 ? winner : other;
    let i = 0;
    let cancelled = false;
    apply(side);
    function step() {
      if (cancelled) return;
      if (i >= delays.length) {
        apply(winner);
        if (o.onDone) o.onDone();
        return;
      }
      st(() => {
        if (cancelled) return;
        side = side === 'A' ? 'B' : 'A';
        apply(side);
        i++;
        step();
      }, delays[i]);
    }
    step();
    return () => {
      cancelled = true;
    };
  }

  const api = { animatePriorityDraw, drawSchedule, DURATION_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPPriorityDraw = api;
})(typeof window !== 'undefined' ? window : undefined);
