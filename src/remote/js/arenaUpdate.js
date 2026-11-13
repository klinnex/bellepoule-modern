/**
 * BellePoule Modern - Arène : plan de mise à jour d'affichage (extrait de arena.html #1401)
 * planArenaUpdate est pur : il traduit un message serveur en liste ordonnée d'opérations que
 * ArenaDisplay applique (état + DOM). Servi en /js/arenaUpdate.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /**
   * @param {object} s état courant {_prioFencerId, theme, currentCustomTheme, matchStatus,
   *   showPhotos, inversionEnabled}
   * @param {object} data message serveur (arena_update)
   * @returns {{op: string, [k: string]: any}[]} opérations dans l'ordre d'application
   */
  function planArenaUpdate(s, data) {
    const ops = [];
    const st = { ...s }; // copie de travail : les conditions voient les ops déjà planifiées
    const set = (key, value) => {
      st[key] = value;
      ops.push({ op: 'set', key, value });
    };
    const photoIntro = () => {
      if (st.matchStatus === 'ready' && st.showPhotos) ops.push({ op: 'updatePhotoIntro' });
    };

    // Tireur prioritaire : cadre doré effacé dès que le match change (#1442)
    if (st._prioFencerId && data.match !== undefined) {
      const m = data.match;
      // ids absents du message : on garde le cadre (même règle que priorityDraw.isOtherMatch)
      const ids = m ? [m.fencerA?.id, m.fencerB?.id] : [];
      if (!m || (ids.some(Boolean) && !ids.includes(st._prioFencerId))) {
        set('_prioFencerId', null);
        ops.push({ op: 'applyPriorityFrame', side: null });
      }
    }

    if (data.theme) {
      const customStr = JSON.stringify(data.customTheme || null);
      const prevCustomStr = JSON.stringify(st.currentCustomTheme);
      if (data.theme !== st.theme || (data.theme === 'custom' && customStr !== prevCustomStr)) {
        ops.push({ op: 'applyTheme', theme: data.theme, customTheme: data.customTheme });
      }
    }

    if (data.showPhotos !== undefined) set('showPhotos', data.showPhotos);
    if (data.refereeFeatureEnabled !== undefined) {
      set('refereeFeatureEnabled', data.refereeFeatureEnabled);
    }

    // État d'inversion synchronisé avec le serveur
    if (data.swapped !== undefined) {
      set('inversionEnabled', data.swapped);
      ops.push({ op: 'syncInversion', value: data.swapped });
      ops.push({ op: 'applyInversionColors' }, { op: 'updateMatchDisplay' });
      ops.push({ op: 'updateVisibility' });
      photoIntro();
    }

    if (data.status) {
      set('matchStatus', data.status);
      ops.push({ op: 'updateStatusBadge' });
      if (data.status === 'finished') ops.push({ op: 'hideCoinFlip' });
    }

    if (data.match) {
      set('currentMatch', data.match);
      ops.push({ op: 'updateMatchDisplay' });
      photoIntro();
    }

    if ('nextMatch' in data) {
      set('nextMatch', data.nextMatch || null);
      if (
        st.matchStatus === 'idle' ||
        st.matchStatus === 'not_started' ||
        (st.matchStatus === 'ready' && !st.showPhotos)
      ) {
        ops.push({ op: 'updateIdleNextMatchDisplay' });
      }
    }

    // Scores (respecte l'inversion)
    if (data.scoreA !== undefined) {
      ops.push({
        op: 'score',
        id: st.inversionEnabled ? 'score-a' : 'score-b',
        value: data.scoreA,
      });
    }
    if (data.scoreB !== undefined) {
      ops.push({
        op: 'score',
        id: st.inversionEnabled ? 'score-b' : 'score-a',
        value: data.scoreB,
      });
    }

    if (data.cardsA) {
      set('cardsA', data.cardsA);
      ops.push({ op: 'updateCardsDisplay' });
    }
    if (data.cardsB) {
      set('cardsB', data.cardsB);
      ops.push({ op: 'updateCardsDisplay' });
    }

    if (data.time !== undefined) {
      set('timerSeconds', data.time);
      ops.push({ op: 'updateTimerDisplay', timerStatus: data.timerStatus });
    }

    if (data.suddenDeath !== undefined) set('isSuddenDeath', data.suddenDeath);
    if (data.overtimeType !== undefined) set('overtimeType', data.overtimeType);
    if (data.waitingOvertime !== undefined) set('waitingOvertime', data.waitingOvertime);
    // Clear automatique quand le timer de mort subite démarre
    if (data.suddenDeath) set('waitingOvertime', false);
    ops.push({ op: 'updateWaitingOvertimeBanner' }, { op: 'updateSuddenDeathBanner' });

    ops.push({ op: 'updateVisibility' });
    return ops;
  }

  const api = { planArenaUpdate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ArenaUpdate = api;
})(typeof window !== 'undefined' ? window : undefined);
