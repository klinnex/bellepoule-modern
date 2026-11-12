/**
 * BellePoule Modern - Arbitre : logique du chrono (extrait de referee.html #1401)
 * Tick sans dérive, décision de fin de temps et sauvegarde locale (#1717). Sans DOM. Servi en /js/refereeTimer.js (CSP 'self').
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

  // ── Sauvegarde locale du chrono (#1717) ──────────────────────────────
  // Un rafraîchissement de la page (fausse manipulation, veille, retour à la liste)
  // ne doit pas remettre le chrono à sa durée initiale pendant un match en cours.
  const TIMER_STATE_PREFIX = 'bp_referee_timer_';
  const TIMER_STATE_MAX_AGE_MS = 6 * 3600 * 1000; // au-delà : sauvegarde périmée
  const TIMER_STATE_MAX_CS = 3600 * 100; // garde-fou : 1 h maximum
  const OVERTIME_TYPES = ['supplementary', 'challenger', 'challenger_supplementary'];

  function timerStateKey(arenaId) {
    return TIMER_STATE_PREFIX + arenaId;
  }

  /**
   * Instantané sérialisable du chrono.
   * @param {{matchId: string, cs: number, isSuddenDeath?: boolean, overtimeType?: string|null, isResting?: boolean}} s
   * @param {number} now horloge (ms epoch)
   */
  function snapshotTimer(s, now) {
    return {
      matchId: s.matchId,
      cs: Math.min(TIMER_STATE_MAX_CS, Math.max(0, Math.round(s.cs))),
      isSuddenDeath: s.isSuddenDeath === true,
      overtimeType: OVERTIME_TYPES.includes(s.overtimeType) ? s.overtimeType : null,
      isResting: s.isResting === true,
      savedAt: now,
    };
  }

  /**
   * État restaurable pour `matchId`, ou null (autre match, périmé, corrompu).
   * @param {string|object|null} raw valeur stockée (JSON) ou objet
   * @param {string} matchId
   * @param {number} now horloge (ms epoch)
   * @returns {{cs: number, isSuddenDeath: boolean, overtimeType: string|null, isResting: boolean}|null}
   */
  function restoreTimer(raw, matchId, now) {
    if (!raw || !matchId) return null;
    let o = raw;
    if (typeof raw === 'string') {
      try {
        o = JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
    if (!o || typeof o !== 'object' || o.matchId !== matchId) return null;
    if (typeof o.cs !== 'number' || !Number.isFinite(o.cs) || o.cs < 0) return null;
    if (o.cs > TIMER_STATE_MAX_CS) return null;
    if (typeof o.savedAt !== 'number' || !Number.isFinite(o.savedAt)) return null;
    // Horloge de la tablette reculée de plus d'une minute : sauvegarde douteuse
    if (now - o.savedAt > TIMER_STATE_MAX_AGE_MS || o.savedAt - now > 60000) return null;
    return {
      cs: Math.round(o.cs),
      isSuddenDeath: o.isSuddenDeath === true,
      overtimeType: OVERTIME_TYPES.includes(o.overtimeType) ? o.overtimeType : null,
      isResting: o.isResting === true,
    };
  }

  /** Écrit l'instantané ; stockage indisponible (navigation privée, quota) toléré. */
  function saveTimerState(storage, arenaId, state, now) {
    try {
      storage.setItem(timerStateKey(arenaId), JSON.stringify(snapshotTimer(state, now)));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadTimerState(storage, arenaId, matchId, now) {
    try {
      return restoreTimer(storage.getItem(timerStateKey(arenaId)), matchId, now);
    } catch (e) {
      return null;
    }
  }

  function clearTimerState(storage, arenaId) {
    try {
      storage.removeItem(timerStateKey(arenaId));
    } catch (e) {
      /* stockage indisponible */
    }
  }

  const api = {
    timerTick,
    timeUpAction,
    timerStateKey,
    snapshotTimer,
    restoreTimer,
    saveTimerState,
    loadTimerState,
    clearTimerState,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPRefereeTimer = api;
})(typeof window !== 'undefined' ? window : undefined);
