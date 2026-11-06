/**
 * BellePoule Modern - Tirage du tireur prioritaire (minute prioritaire, #1442)
 * Le cadre doré passe d'un tireur à l'autre en ralentissant, puis se fixe au bout de ~3 s.
 * Partagé arbitre / écran d'arène / vue publique. Servi en /js/priorityDraw.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const DURATION_MS = 3000;
  const T = (k, p) => (root && root.T ? root.T(k, p) : k);

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

  /**
   * Écrans arène/public : événement coin_flip « priority » → mémorise le prioritaire et anime.
   * @param {{_prioFencerId?: string|null, applyPriorityFrame: (side: 'A'|'B'|null) => void}} app
   */
  function fromEvent(app, data) {
    const f = data.winner === 'A' ? data.fencerA : data.fencerB;
    app._prioFencerId = (f && f.id) || null;
    return animatePriorityDraw(side => app.applyPriorityFrame(side), data.winner);
  }

  /**
   * Tablette arbitre : tirage du prioritaire sans désigner de vainqueur. Le cadre doré alterne
   * ~3 s puis se fixe ; le chrono est remis à la durée de la minute supplémentaire, prêt à lancer.
   */
  function installReferee(proto) {
    proto.startPriorityDraw = function (winner) {
      this.priorityDrawPhase = false;
      const f = this.currentMatch && (winner === 'A' ? this.currentMatch.fencerA : this.currentMatch.fencerB);
      this._prioFencerId = (f && f.id) || null;
      this.socket.emit('arena_control', { arenaId: this.arenaId, action: 'coin_flip', winner, priority: true });
      this.showNotification(T('referee.coin_anim'));
      this._priorityAnimating = true;
      this.updateControlButtons();
      animatePriorityDraw(side => this.applyPriorityFrame(side), winner, {
        onDone: () => {
          this._priorityAnimating = false;
          this.preparePriorityMinute();
        },
      });
    };
    proto.preparePriorityMinute = function () {
      this.timerSeconds = this.overtimeSeconds();
      this.waitingOvertimeStart = true;
      this.updateTimerDisplay();
      this.updateControlButtons();
      this.socket.emit('arena_control', {
        arenaId: this.arenaId,
        action: 'waiting_overtime',
        time: this.overtimeSeconds(),
        timerStatus: 'paused',
      });
      this.showNotification(T('referee.tie_launch', { label: this.overtimeLabel() }));
    };
  }

  const api = { animatePriorityDraw, drawSchedule, fromEvent, installReferee, DURATION_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPPriorityDraw = api;
})(typeof window !== 'undefined' ? window : undefined);
