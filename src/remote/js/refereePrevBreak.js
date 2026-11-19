/**
 * BellePoule Modern - Arbitre : rappel du match précédent (PREV) et pause sabre à 8 touches (#2001)
 * - PREV : bouton « Match précédent » de la liste des matchs. Le serveur refuse si un combat est
 *   en cours ou si la fenêtre de correction (3 min) est dépassée ; son verdict revient dans
 *   `arena:{id}:prev_result` et s'affiche en notification.
 * - Pause sabre (t.39.1) : le serveur émet `arena:{id}:sabre_break` quand un tireur atteint 8
 *   touches (sabre, tableau à 15). La tablette arrête le chrono et lance la minute de repos avec
 *   le mécanisme de repos existant ; à la fin du repos, le chrono reprend sa valeur d'avant.
 * Script classique : window.BPRefereePrevBreak.install(RefereeApp.prototype). Servi en /js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const PREV_REASON_KEYS = {
    none: 'referee.prev_none',
    expired: 'referee.prev_expired',
    in_progress: 'referee.prev_in_progress',
    error: 'referee.prev_error',
  };

  /** Notification du verdict PREV : clé i18n et indicateur d'erreur */
  function prevFeedback(verdict) {
    if (verdict && verdict.ok) return { key: 'referee.prev_ok', isError: false };
    const reason = verdict && verdict.reason;
    return { key: PREV_REASON_KEYS[reason] || PREV_REASON_KEYS.error, isError: true };
  }

  /**
   * La pause sabre peut-elle démarrer sur la tablette ?
   * Refusée sans match en cours, pendant un repos déjà lancé, ou si un appareil de piste maître
   * tient le chrono (il gère sa propre pause).
   * @param {{hasMatch: boolean, matchStatus: string, isResting: boolean, deviceMaster: boolean}} s
   * @returns {'start'|'device'|'ignore'}
   */
  function sabreBreakPlan(s) {
    if (!s.hasMatch || s.matchStatus !== 'in_progress' || s.isResting) return 'ignore';
    return s.deviceMaster ? 'device' : 'start';
  }

  const methods = {
    /** Bouton « Match précédent » : le verdict revient en `prev_result` */
    requestPrevMatch() {
      this.socket.emit('arena_control', { arenaId: this.arenaId, action: 'prev' });
    },

    onPrevResult(verdict) {
      const fb = prevFeedback(verdict);
      this.showNotification(window.T(fb.key), fb.isError);
    },

    /** Première période sabre terminée : chrono arrêté, une minute de repos */
    onSabreBreak(payload) {
      const plan = sabreBreakPlan({
        hasMatch: !!this.currentMatch,
        matchStatus: this.matchStatus,
        isResting: this.isResting,
        deviceMaster: !!this.cyranoMasterLock,
      });
      if (plan === 'ignore') return;
      this.showNotification(window.T('referee.sabre_break_notif'));
      if (plan === 'device') return;
      const seconds = payload && payload.seconds > 0 ? payload.seconds : 60;
      this._sabreBreakCs = this._timerCs;
      this.stopTimer();
      this.waitingOvertimeStart = false;
      this.waitingCoinFlip = false;
      this.isResting = true;
      this.timerSeconds = seconds;
      this.updateControlButtons();
      this.startTimer();
    },
  };

  /** Branche les méthodes sur le prototype de la tablette ; fin de repos : restaure le chrono d'avant la pause */
  function install(proto) {
    Object.assign(proto, methods);
    const endRest = proto.endRest;
    proto.endRest = function () {
      const before = this._sabreBreakCs;
      this._sabreBreakCs = null;
      endRest.call(this);
      if (before > 0) {
        this._timerCs = before;
        this.updateTimerDisplay();
        this.broadcastTimerUpdate();
      }
    };
  }

  const api = { prevFeedback, sabreBreakPlan, install };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPRefereePrevBreak = api;
})(typeof window !== 'undefined' ? window : undefined);
