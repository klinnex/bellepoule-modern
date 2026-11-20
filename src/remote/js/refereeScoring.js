/**
 * BellePoule Modern - Arbitre : règles de saisie des points (extrait de referee.html #1401)
 * Zones de score, validation d'une touche, mort subite challenger. Pur, sans DOM.
 * Servi en /js/refereeScoring.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const isChallenger = type => type === 'challenger' || type === 'challenger_supplementary';

  /** Zones de score actives (3 max) selon la config personnalisée, ou null en standard */
  function activeCustomZones(customScoring, isTableau) {
    const cs = customScoring;
    if (!cs) return null;
    const scoring = isTableau ? cs.de : cs.pool;
    if (!scoring) return null;
    if (scoring.type === 'zones' && scoring.zones && scoring.zones.length > 0) {
      return scoring.zones.slice(0, 3).map(z => ({ label: z.label, points: z.points }));
    }
    return [{ label: '', points: 1 }];
  }

  /** Points réellement attribués par le bouton du palier 1 / 3 / 5 */
  function slotPoints(zones, slot) {
    if (!zones) return slot;
    const idx = slot === 1 ? 0 : slot === 3 ? 1 : 2;
    return zones[idx] ? zones[idx].points : slot;
  }

  /** Lettre de zone (A/B/C) pour un nombre de points */
  function zoneLetter(zones, points) {
    if (zones) {
      const idx = zones.findIndex(z => z.points === points);
      return ['A', 'B', 'C'][idx < 0 ? 0 : idx];
    }
    return points === 1 ? 'A' : points === 3 ? 'B' : 'C';
  }

  /**
   * Une touche peut-elle être saisie ?
   * @returns {{ok: true}|{ok: false, notify?: string, params?: object}} notify = clé i18n
   */
  function validateAddScore(s) {
    if (!s.hasMatch) return { ok: false };
    if (s.matchStatus === 'not_started') return { ok: false, notify: 'referee.start_first' };
    if (s.matchStatus === 'finished') return { ok: false };

    // En mort subite challenger (10-10), seule la zone C (+5) est autorisée
    if (s.isSuddenDeath && isChallenger(s.overtimeType) && s.points !== 5) {
      return { ok: false, notify: 'referee.sd_zone_c_notif' };
    }

    // Restriction de zones en mode entraînement
    const allowed = s.trainingCustomRules && s.trainingCustomRules.allowedZones;
    if (allowed && allowed.length > 0 && !allowed.includes(s.zone)) {
      return {
        ok: false,
        notify: 'referee.zone_not_allowed',
        params: { zone: s.zone, allowed: allowed.join(', ') },
      };
    }
    return { ok: true };
  }

  /** Durée de vibration (ms) selon les points */
  function vibrationMs(points) {
    return points === 5 ? 120 : points === 3 ? 80 : 40;
  }

  /**
   * Mort subite challenger si les DEUX combattants ≥ 10 pts (Laser Sabre uniquement), hors
   * mort subite ou pendant le temps supplémentaire.
   */
  function shouldTriggerChallenger(s) {
    return (
      !!s.isLaserSabre &&
      !(s.trainingCustomRules && s.trainingCustomRules.disableSuddenDeath) &&
      (!s.isSuddenDeath || s.overtimeType === 'supplementary') &&
      s.scoreA >= 10 &&
      s.scoreB >= 10
    );
  }

  /**
   * Après retrait d'un point : si un score repasse sous 10, on quitte la mort subite challenger.
   * @returns {{overtimeType: string|null, isSuddenDeath: boolean}|null} null : rien à changer
   */
  function challengerExit(s) {
    if (!(s.isSuddenDeath && s.isLaserSabre && isChallenger(s.overtimeType))) return null;
    if (s.scoreA >= 10 && s.scoreB >= 10) return null;
    // Revenir au temps supplémentaire si c'était déclenché pendant le supplémentaire
    const overtimeType = s.overtimeType === 'challenger_supplementary' ? 'supplementary' : null;
    return { overtimeType, isSuddenDeath: overtimeType === null ? false : s.isSuddenDeath };
  }

  const api = {
    activeCustomZones,
    slotPoints,
    zoneLetter,
    validateAddScore,
    vibrationMs,
    shouldTriggerChallenger,
    challengerExit,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPRefereeScoring = api;
})(typeof window !== 'undefined' ? window : undefined);
