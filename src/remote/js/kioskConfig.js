/**
 * BellePoule Modern - Kiosque : réglages locaux et compte à rebours de la note d'organisation
 * (extrait de kiosk.html #1401). Stockage et horloge injectés. Servi en /js/kioskConfig.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const TABLEAU_MODES = ['compact', 'focus', 'auto', 'cinema'];
  const DEFAULT_ROTATION_SEC = 15;
  const MIN_ROTATION_SEC = 3;

  /** Réglages persistés par écran (localStorage) : vues actives, délai de rotation, mode du tableau */
  function createLocalConfig(storage) {
    return {
      saveViews(checkedByView) {
        storage.setItem('kioskViewsLocal', JSON.stringify(checkedByView));
      },
      loadViews() {
        try {
          const stored = storage.getItem('kioskViewsLocal');
          if (stored) return JSON.parse(stored);
        } catch {
          /* JSON invalide ou stockage inaccessible : réglage ignoré */
        }
        return null;
      },
      saveRotation(sec) {
        storage.setItem('kioskRotationSec', String(sec));
      },
      loadRotation() {
        const v = parseInt(storage.getItem('kioskRotationSec'), 10);
        return !isNaN(v) && v >= MIN_ROTATION_SEC ? v : DEFAULT_ROTATION_SEC;
      },
      saveTableauMode(mode) {
        storage.setItem('kioskTableauMode', mode);
      },
      loadTableauMode() {
        const v = storage.getItem('kioskTableauMode');
        return TABLEAU_MODES.includes(v) ? v : 'auto';
      },
    };
  }

  /** « HH:MM » -> { hh, mm, label: « 14h05 » } */
  function parseTargetTime(str) {
    const [hh, mm] = String(str).split(':').map(Number);
    return { hh, mm, label: String(hh).padStart(2, '0') + 'h' + String(mm).padStart(2, '0') };
  }

  /** Secondes restantes avant la prochaine occurrence de hh:mm (lendemain si déjà passée) */
  function secondsUntil(hh, mm, now) {
    const target = new Date(now);
    target.setHours(hh, mm, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  }

  /** Texte du compte à rebours : « <préfixe> 12 min 05 s » */
  function formatCountdown(prefix, diffSec) {
    const m = Math.floor(diffSec / 60);
    const s = diffSec % 60;
    return prefix + ' ' + m + ' min ' + String(s).padStart(2, '0') + ' s';
  }

  const api = { createLocalConfig, parseTargetTime, secondsUntil, formatCountdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KioskConfig = api;
})(typeof window !== 'undefined' ? window : undefined);
