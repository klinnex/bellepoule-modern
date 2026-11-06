/**
 * BellePoule Modern - Arbitre : transitions d'état reçues du serveur (extrait de referee.html #1401)
 * Fonctions pures : décident de l'action à mener et construisent les matchs locaux.
 * Servi en /js/refereeUpdate.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /** Score serveur : nombre ou objet {value} */
  function scoreValue(v) {
    return typeof v === 'object' ? (v?.value ?? 0) : (v ?? 0);
  }

  /** Règles modifiées en propriétés (#1118) : rechargement seulement hors match */
  function shouldReloadForRules(s, data) {
    return (
      !!s.rulesLoaded &&
      typeof data.modernRules === 'boolean' &&
      data.modernRules !== s.isModernFencing &&
      !s.timerRunning &&
      s.matchStatus !== 'in_progress'
    );
  }

  /**
   * Transition selon `data.status`.
   * @param {{currentMatchId?: string, matchStatus: string}} s
   * @returns {{action: 'none'|'poolComplete'|'closedByApp'|'idleClear'|'resume'|'notifyNextAfter'|'newMatch',
   *   match?: object, hidePoolOverlay?: true}}
   */
  function planStatusTransition(s, data) {
    if (data.status === 'idle') {
      if (data.poolComplete) return { action: 'poolComplete' };
      return { action: s.matchStatus === 'in_progress' ? 'closedByApp' : 'idleClear' };
    }

    if (data.status === 'in_progress' && data.match && data.match.id) {
      if (s.currentMatchId === data.match.id) return { action: 'none' };
      if (s.matchStatus === 'in_progress') return { action: 'none' };
      return {
        action: 'resume',
        match: {
          id: data.match.id,
          poolId: data.match.poolId,
          fencerA: data.fencerA || data.match.fencerA,
          fencerB: data.fencerB || data.match.fencerB,
          scoreA: { value: scoreValue(data.scoreA) },
          scoreB: { value: scoreValue(data.scoreB) },
          status: 'in_progress',
        },
      };
    }

    // Nouveau match prêt côté serveur (chargement automatique après fin de match)
    if (data.status === 'ready' && data.match && data.match.id) {
      if (s.currentMatchId === data.match.id) return { action: 'none', hidePoolOverlay: true };
      if (s.matchStatus === 'in_progress') {
        return { action: 'notifyNextAfter', hidePoolOverlay: true };
      }
      return {
        action: 'newMatch',
        hidePoolOverlay: true,
        match: {
          id: data.match.id,
          poolId: data.match.poolId,
          fencerA: data.fencerA || data.match.fencerA,
          fencerB: data.fencerB || data.match.fencerB,
          scoreA: { value: 0 },
          scoreB: { value: 0 },
          status: 'not_started',
        },
      };
    }
    return { action: 'none' };
  }

  /** Remplace le match de même id (tel quel) ou l'ajoute (mute la liste) */
  function replaceOrPush(matches, match) {
    const idx = matches.findIndex(m => m.id === match.id);
    if (idx >= 0) matches[idx] = match;
    else matches.push(match);
  }

  /** Match prêt : le match existant repasse en « not_started », sinon ajout (mute la liste) */
  function markReadyOrPush(matches, match) {
    const idx = matches.findIndex(m => m.id === match.id);
    if (idx >= 0) matches[idx] = { ...matches[idx], status: 'not_started' };
    else matches.push(match);
  }

  const api = {
    scoreValue,
    shouldReloadForRules,
    planStatusTransition,
    replaceOrPush,
    markReadyOrPush,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPRefereeUpdate = api;
})(typeof window !== 'undefined' ? window : undefined);
