/**
 * BellePoule Modern - Arbitre : état des boutons de contrôle et du chrono (extrait de referee.html #1401)
 * Fonctions pures : l'état est décrit, RefereeApp applique au DOM. Servi en /js/refereeControls.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /**
   * État du bouton Démarrer/Pause et du bouton Terminer.
   * @param {object} s {priorityAnimating, waitingOvertimeStart, waitingCoinFlip, scoreA, scoreB,
   *   matchStatus, hasMatch, timerRunning, overtimeLabel}
   * @returns {{lockAll?: true, start?: {disabled, key, icon, params?, className}, finishDisabled?: boolean,
   *   updateScoreButtons?: true, updateRestButton?: true}}
   */
  function controlButtonsState(s) {
    // Tirage du prioritaire en cours (#1442) : rien à lancer
    if (s.priorityAnimating) return { lockAll: true };

    // Attente : l'arbitre doit déclencher manuellement le temps supplémentaire
    if (s.waitingOvertimeStart) {
      return {
        start: {
          disabled: false,
          key: 'referee.launch_overtime',
          icon: 'timer',
          params: { label: s.overtimeLabel },
          className: 'control-btn btn-launch-overtime',
        },
        finishDisabled: false,
        updateScoreButtons: true,
      };
    }

    // Fin du temps supplémentaire à égalité : tirage au sort manuel (#1136)
    if (s.waitingCoinFlip && s.scoreA === s.scoreB) {
      return {
        start: {
          disabled: false,
          key: 'referee.coin_btn',
          icon: 'coins',
          className: 'control-btn btn-launch-overtime',
        },
        finishDisabled: false,
        updateScoreButtons: true,
        updateRestButton: true,
      };
    }

    let start;
    if (s.matchStatus === 'not_started') {
      start = {
        disabled: !s.hasMatch,
        key: 'referee.start',
        icon: 'play',
        className: 'control-btn btn-start',
      };
    } else if (s.matchStatus === 'in_progress') {
      start = s.timerRunning
        ? {
            disabled: false,
            key: 'referee.pause',
            icon: 'pause',
            className: 'control-btn btn-pause',
          }
        : {
            disabled: false,
            key: 'referee.resume',
            icon: 'play',
            className: 'control-btn btn-resume',
          };
    } else {
      start = {
        disabled: true,
        key: 'referee.start',
        icon: 'play',
        className: 'control-btn btn-start',
      };
    }
    return {
      start,
      finishDisabled: s.matchStatus !== 'in_progress',
      updateScoreButtons: true,
      updateRestButton: true,
    };
  }

  /** Classes CSS de l'affichage du chrono */
  function timerClasses(s) {
    const c = ['timer-display'];
    if (s.timerRunning) c.push('running');
    else if (s.timerSeconds < s.defaultTimerSeconds) c.push('paused');
    if (s.timerSeconds <= 10) c.push('danger');
    else if (s.timerSeconds <= 30) c.push('warning');
    return c;
  }

  /** Les boutons score/carton sont verrouillés avant le début et après la fin du match */
  function scoreButtonsLocked(matchStatus) {
    return matchStatus === 'not_started' || matchStatus === 'finished';
  }

  /** Le repos (escrime moderne) n'est possible qu'à 0 s, chrono arrêté, match en cours */
  function canStartRest(s) {
    return (
      !!s.isModernFencing &&
      s.restSeconds > 0 &&
      !!s.hasMatch &&
      s.matchStatus === 'in_progress' &&
      s.timerSeconds === 0 &&
      !s.timerRunning &&
      !s.isResting
    );
  }

  const api = { controlButtonsState, timerClasses, scoreButtonsLocked, canStartRest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPRefereeControls = api;
})(typeof window !== 'undefined' ? window : undefined);
