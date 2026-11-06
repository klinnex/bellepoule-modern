/**
 * BellePoule Modern - Écran d'arène : rendu du match en cours, extrait de arena.html (#1401)
 * Badge de statut, noms/scores, couleurs inversées, cartons, chrono, bannières de mort subite.
 * Le DOM et les dépendances (T, escHtml, BPTimer) sont injectés. Servi en /js/arenaRender.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const STATUS_BADGES = {
    idle: ['arena.status_waiting', 'status-waiting'],
    not_started: ['arena.status_waiting', 'status-waiting'],
    ready: ['arena.status_next', 'status-waiting'],
    in_progress: ['arena.status_in_progress', 'status-progress'],
    finished: ['arena.status_finished', 'status-finished'],
  };

  const KNOWN_CARDS = ['white', 'yellow', 'red', 'black', 'p-red', 'p-black'];

  function updateStatusBadge(doc, T, matchStatus) {
    const badge = doc.getElementById('match-status');
    badge.className = 'match-status-badge';
    const def = STATUS_BADGES[matchStatus];
    if (!def) return;
    badge.textContent = T(def[0]);
    badge.classList.add(def[1]);
  }

  /** Valeur d'un score : nombre, ou objet { value } */
  function scoreValue(s) {
    return (typeof s === 'object' ? (s?.value ?? 0) : s) ?? 0;
  }

  function fullName(f) {
    return `${f.lastName || ''} ${f.firstName || ''}`.trim() || '-';
  }

  function applyInversionColors(doc, inv) {
    const setClass = (id, cls) => {
      const el = doc.getElementById(id);
      if (el) el.className = cls;
    };
    setClass('fencer-a-display', `fencer-display ${inv ? 'green-side' : 'red-side'}`);
    setClass('fencer-b-display', `fencer-display ${inv ? 'red-side' : 'green-side'}`);
    setClass('color-badge-a', `color-badge ${inv ? 'green' : 'red'}`);
    setClass('color-badge-b', `color-badge ${inv ? 'red' : 'green'}`);
    const scoreA = doc.getElementById('score-a');
    const scoreB = doc.getElementById('score-b');
    if (scoreA)
      scoreA.className = scoreA.className.replace(/\b(green|red)\b/, inv ? 'green' : 'red');
    if (scoreB)
      scoreB.className = scoreB.className.replace(/\b(green|red)\b/, inv ? 'red' : 'green');
  }

  /** Noms, clubs et scores ; sans inversion, tireur B à gauche (rouge) */
  function updateMatchDisplay(doc, match, inv) {
    if (!match) return;
    const fA = match.fencerA || {};
    const fB = match.fencerB || {};
    const left = inv ? fA : fB;
    const right = inv ? fB : fA;
    doc.getElementById('fencer-a-name').textContent = fullName(left);
    doc.getElementById('fencer-a-club').textContent = left.club || '';
    doc.getElementById('fencer-b-name').textContent = fullName(right);
    doc.getElementById('fencer-b-club').textContent = right.club || '';
    const valA = scoreValue(match.scoreA);
    const valB = scoreValue(match.scoreB);
    doc.getElementById('score-a').textContent = inv ? valA : valB;
    doc.getElementById('score-b').textContent = inv ? valB : valA;
    applyInversionColors(doc, inv);
  }

  /** HTML des pastilles de cartons (valeurs connues seulement, échappées) */
  function cardsHtml(cards, esc) {
    return cards
      .filter(card => KNOWN_CARDS.includes(card))
      .map(card => {
        const letter = card.startsWith('p-')
          ? 'P'
          : card === 'white'
            ? 'B'
            : card === 'yellow'
              ? 'J'
              : card === 'black'
                ? 'N'
                : 'R';
        return `<div class="card card-${esc(card)}">${letter}</div>`;
      })
      .join('');
  }

  function updateCardsDisplay(doc, esc, cardsA, cardsB, inv) {
    doc.getElementById('fencer-a-cards').innerHTML = cardsHtml(inv ? cardsA : cardsB, esc);
    doc.getElementById('fencer-b-cards').innerHTML = cardsHtml(inv ? cardsB : cardsA, esc);
  }

  /** Classes du chrono : état (running/paused) + alerte (danger ≤ 10 s, warning ≤ 30 s) */
  function timerClasses(timerSeconds, timerStatus) {
    const cls = ['timer-display'];
    if (timerStatus === 'running') cls.push('running');
    else if (timerStatus === 'paused') cls.push('paused');
    if (timerSeconds <= 10) cls.push('danger');
    else if (timerSeconds <= 30) cls.push('warning');
    return cls;
  }

  function updateTimerDisplay(doc, timerLib, timerSeconds, timerStatus) {
    const el = doc.getElementById('timer-display');
    timerLib.renderTimer(el, timerSeconds); // dixièmes sur les 10 dernières secondes (#1416)
    el.className = timerClasses(timerSeconds, timerStatus).join(' ');
  }

  /** Quelles bannières de mort subite afficher */
  function suddenDeathFlags(isSuddenDeath, overtimeType) {
    return {
      supplementary:
        !!isSuddenDeath &&
        (overtimeType === 'supplementary' || overtimeType === 'challenger_supplementary'),
      challenger:
        !!isSuddenDeath &&
        (overtimeType === 'challenger' || overtimeType === 'challenger_supplementary'),
    };
  }

  function updateSuddenDeathBanner(doc, isSuddenDeath, overtimeType) {
    const flags = suddenDeathFlags(isSuddenDeath, overtimeType);
    const banner = doc.getElementById('sudden-death-banner');
    const msBanner = doc.getElementById('mort-subite-banner');
    if (banner) banner.classList.toggle('active', flags.supplementary);
    if (msBanner) msBanner.classList.toggle('active', flags.challenger);
  }

  const api = {
    scoreValue,
    updateStatusBadge,
    applyInversionColors,
    updateMatchDisplay,
    cardsHtml,
    updateCardsDisplay,
    timerClasses,
    updateTimerDisplay,
    suddenDeathFlags,
    updateSuddenDeathBanner,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPArenaRender = api;
})(typeof window !== 'undefined' ? window : undefined);
