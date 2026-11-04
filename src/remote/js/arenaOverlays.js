/**
 * BellePoule Modern - Écran d'arène : bannières et surcouches, extraites de arena.html (#1401)
 * Annonces de carton / sortie, pile ou face, message distant, identification de l'écran.
 * Le DOM et les dépendances sont injectés (testable). Servi en /js/arenaOverlays.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const CARD_LABELS = { white: 'BLANC', yellow: 'JAUNE', red: 'ROUGE' };

  /** Lignes + classe CSS de la bannière de carton (revalorisation incluse) */
  function cardAnnouncement(ann) {
    const typeLabel = CARD_LABELS[ann.cardType] || 'NOIR';
    let line1;
    if (ann.isRevalorisation) {
      const from =
        ann.fromCard === 'white' ? 'blanc' : ann.fromCard === 'yellow' ? 'jaune' : ann.fromCard;
      line1 = `⚠️ Revalorisation 2ème ${from} → ${typeLabel} — ${ann.fencerName}`;
    } else {
      line1 = `Carton ${typeLabel} — ${ann.fencerName}`;
    }
    const cardClass = ['white', 'yellow', 'red', 'black'].includes(ann.cardType)
      ? ann.cardType
      : 'yellow';
    return {
      line1,
      line2: ann.reason || null,
      className: `card-announcement-banner visible card-${cardClass}`,
    };
  }

  /** Lignes + classe CSS de la bannière de sortie d'arène */
  function exitAnnouncement(ann) {
    return {
      line1: `🚪 Sortie d'arène — ${ann.fencerName}`,
      line2: `+${ann.points} pts pour l'adversaire`,
      className: 'card-announcement-banner visible card-exit',
    };
  }

  /** Plan du pile ou face : fencerA est toujours VERT, fencerB toujours ROUGE */
  function coinFlipPlan(winner, fencerA, fencerB) {
    const fullName = (f, fallback) =>
      (f ? `${f.lastName || ''} ${f.firstName || ''}`.trim() : '') || fallback;
    const nameGreen = fullName(fencerA, 'VERT');
    const nameRed = fullName(fencerB, 'ROUGE');
    const green = winner === 'A';
    return {
      nameGreen,
      nameRed,
      finalDeg: green ? 3600 : 3780,
      resultText: `🏆 ${green ? nameGreen : nameRed} gagne ! (${green ? 'VERT' : 'ROUGE'})`,
      resultClass: green ? 'winner-green' : 'winner-red',
    };
  }

  /** Message distant en bas d'écran (texte seul) */
  function showRemoteMessage(doc, text, duration) {
    let banner = doc.getElementById('remote-msg-banner');
    if (!banner) {
      banner = doc.createElement('div');
      banner.id = 'remote-msg-banner';
      banner.style.cssText =
        'position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,0.82);color:#fff;font-size:1.3rem;padding:0.7rem 1.2rem;text-align:center;z-index:9999;pointer-events:none;transition:opacity 0.4s;';
      doc.body.appendChild(banner);
    }
    banner.textContent = text;
    banner.style.opacity = '1';
    clearTimeout(banner._hideTimer);
    banner._hideTimer = setTimeout(() => {
      banner.style.opacity = '0';
    }, duration);
  }

  /**
   * Surcouche clignotante « identifier cet écran ».
   * @param {{doc: Document, T: Function, esc: (s: string) => string}} deps
   */
  function showIdentifyOverlay(deps, label, durationMs) {
    const { doc, T, esc } = deps;
    let ov = doc.getElementById('bp-identify-overlay');
    if (!ov) {
      ov = doc.createElement('div');
      ov.id = 'bp-identify-overlay';
      ov.style.cssText =
        'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;pointer-events:none;animation:bp-identify-blink 0.5s ease-in-out infinite alternate;';
      const style = doc.createElement('style');
      style.textContent =
        '@keyframes bp-identify-blink{from{background:rgba(59,130,246,0.55)}to{background:rgba(139,92,246,0.65)}}';
      doc.head.appendChild(style);
      doc.body.appendChild(ov);
    }
    ov.innerHTML =
      '<div style="background:rgba(0,0,0,0.85);border:3px solid #3b82f6;border-radius:1.5rem;padding:2rem 4rem;text-align:center;max-width:80vw;">' +
      '<div style="font-size:2.5rem;font-weight:900;color:#fff;margin-bottom:0.5rem;">📺 ' +
      esc(label) +
      '</div>' +
      '<div style="font-size:1rem;color:#94a3b8;">' +
      esc(T('kiosk.identify')) +
      '</div>' +
      '</div>';
    ov.style.display = 'flex';
    clearTimeout(ov._t);
    ov._t = setTimeout(() => {
      ov.style.display = 'none';
    }, durationMs ?? 5000);
  }

  const api = {
    cardAnnouncement,
    exitAnnouncement,
    coinFlipPlan,
    showRemoteMessage,
    showIdentifyOverlay,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPArenaOverlays = api;
})(typeof window !== 'undefined' ? window : undefined);
