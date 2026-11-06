/**
 * BellePoule Modern - Arbitre : logique du chrono (extrait de referee.html #1401)
 * Tick sans dérive et décision de fin de temps. Pur, sans DOM. Servi en /js/refereeTimer.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /**
   * Un tick du chrono (10 ms, sans dérive, #1416).
   * @param {number} endAt échéance (ms epoch)
   * @param {number} now horloge (ms epoch)
   * @param {number} prevCs centièmes restants au tick précédent
   * @param {number} lastTenth dixième du tick précédent
   * @returns {{cs, lastTenth, fullRender: boolean, broadcast: boolean, announce: boolean, finished: boolean}}
   *   fullRender : affichage complet (10/s ou fin) ; broadcast : diffusion 1/s puis 10/s sous 10 s ;
   *   announce : seconde changée (annonce vocale)
   */
  function timerTick(endAt, now, prevCs, lastTenth) {
    const cs = Math.max(0, Math.round((endAt - now) / 10));
    const secChanged = Math.ceil(cs / 100) !== Math.ceil(prevCs / 100);
    const tenth = Math.floor(cs / 10);
    const tenthChanged = tenth !== lastTenth;
    return {
      cs,
      lastTenth: tenth,
      fullRender: tenthChanged || cs === 0,
      broadcast: secChanged || (tenthChanged && cs <= 1000),
      announce: secChanged,
      finished: Math.ceil(cs / 100) === 0,
    };
  }

  /**
   * Que faire à 00:00 ?
   * @param {{isResting, trainingCustomRules, scoreA, scoreB, isSuddenDeath, overtimeType, isModernFencing}} s
   * @returns {'endRest'|'priorityDraw'|'suddenDeath'|'priorityApplies'|'coinFlip'|'timeUp'}
   */
  function timeUpAction(s) {
    if (s.isResting) return 'endRest';
    const sdDisabled = s.trainingCustomRules && s.trainingCustomRules.disableSuddenDeath;
    const tie = s.scoreA === s.scoreB;
    if (!sdDisabled && tie && (!s.isSuddenDeath || s.overtimeType === 'challenger')) {
      // Olympique : minute prioritaire tirée AVANT la minute supplémentaire (#1442) ;
      // sinon attente manuelle de l'arbitre pour lancer le temps supplémentaire
      return s.isModernFencing ? 'priorityDraw' : 'suddenDeath';
    }
    if (!sdDisabled && s.isSuddenDeath && tie) {
      // Olympique : le prioritaire gagne si aucune touche (#1442) ; sinon tirage au sort (#1136)
      return s.isModernFencing ? 'priorityApplies' : 'coinFlip';
    }
    return 'timeUp';
  }

  const api = { timerTick, timeUpAction };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPRefereeTimer = api;
})(typeof window !== 'undefined' ? window : undefined);
