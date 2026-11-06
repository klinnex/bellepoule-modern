/**
 * BellePoule Modern - Kiosque : vue des pistes (extrait de kiosk.html #1401)
 * Détection des changements de score et gabarit HTML (escHtml, tk et libellé injectés :
 * toute donnée dynamique est échappée). Servi en /js/kioskArenas.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /**
   * Compare les scores courants aux précédents.
   * @param {object[]} arenas pistes
   * @param {Object<string,{scoreA,scoreB}>} prev scores précédents par id de piste
   * @returns {{changed: string[], slash: string[]}} ids d'éléments à animer ; slash = +3 pts ou plus d'un coup
   */
  function detectScoreChanges(arenas, prev) {
    const changed = [];
    const slash = [];
    const check = (id, before, now) => {
      if (before === now) return;
      changed.push(id);
      if (typeof now === 'number' && typeof before === 'number' && now - before >= 3) {
        slash.push(id);
      }
    };
    for (const arena of arenas) {
      const aid = arena.id || arena.arenaId;
      const m = arena.currentMatch;
      if (!m || !aid) continue;
      const p = prev[aid];
      if (!p) continue;
      check('sa-' + aid, p.scoreA, m.scoreA ?? null);
      check('sb-' + aid, p.scoreB, m.scoreB ?? null);
    }
    return { changed, slash };
  }

  /** Scores courants à mémoriser pour la prochaine comparaison */
  function snapshotScores(arenas) {
    const out = {};
    for (const arena of arenas) {
      const aid = arena.id || arena.arenaId;
      if (!aid) continue;
      const m = arena.currentMatch;
      out[aid] = { scoreA: m ? (m.scoreA ?? null) : null, scoreB: m ? (m.scoreB ?? null) : null };
    }
    return out;
  }

  /**
   * HTML des cartes de piste.
   * @param {object[]} arenas
   * @param {{tk: Function, escHtml: Function, arenaLabel: string}} ctx
   */
  function renderArenasHtml(arenas, ctx) {
    const { tk, escHtml, arenaLabel } = ctx;
    return arenas
      .map(arena => {
        const aid = arena.id || arena.arenaId || '?';
        const m = arena.currentMatch;
        const isActive = arena.status === 'in_progress' && m;

        if (!m) {
          return `<div class="arena-card">
              <div class="arena-card-header">
                <span class="arena-name">${escHtml(arenaLabel)} ${escHtml(aid)}</span>
                <span class="arena-status-pill">${escHtml(tk('kiosk.status_waiting'))}</span>
              </div>
              <div class="arena-idle">${escHtml(tk('kiosk.no_assigned'))}</div>
            </div>`;
        }

        const fullName = f => [f?.lastName, f?.firstName].filter(Boolean).join(' ');
        const nameA = fullName(m.fencerA) || m.fencerA || '?';
        const nameB = fullName(m.fencerB) || m.fencerB || '?';
        // Même disposition que l'écran d'arène : B rouge à gauche, A vert à droite ;
        // inversion = permutation (#990)
        const sideA = {
          name: nameA,
          club: m.fencerA?.club || '',
          score: m.scoreA ?? '—',
          scoreId: `sa-${aid}`,
        };
        const sideB = {
          name: nameB,
          club: m.fencerB?.club || '',
          score: m.scoreB ?? '—',
          scoreId: `sb-${aid}`,
        };
        const left = arena.swapped ? sideA : sideB;
        const right = arena.swapped ? sideB : sideA;
        const leftColor = arena.swapped ? 'green' : 'red';
        const rightColor = arena.swapped ? 'red' : 'green';

        return `<div class="arena-card ${isActive ? 'match-active' : ''}">
            <div class="arena-card-header">
              <span class="arena-name">${escHtml(arenaLabel)} ${escHtml(aid)}</span>
              <span class="arena-status-pill ${isActive ? 'in-progress' : ''}">${isActive ? escHtml(tk('kiosk.status_ongoing')) : escHtml(tk('kiosk.status_assigned'))}</span>
            </div>
            <div class="arena-matchup">
              <div class="arena-fencer side-left fencer-${escHtml(leftColor)}">
                <div class="fname">${escHtml(left.name)}</div>
                <div class="fclub">${escHtml(left.club)}</div>
              </div>
              <div class="arena-scores">
                <span class="arena-score score-${escHtml(leftColor)}" id="${escHtml(left.scoreId)}">${escHtml(left.score)}</span>
                <span class="arena-vs">-</span>
                <span class="arena-score score-${escHtml(rightColor)}" id="${escHtml(right.scoreId)}">${escHtml(right.score)}</span>
              </div>
              <div class="arena-fencer side-right fencer-${escHtml(rightColor)}">
                <div class="fname">${escHtml(right.name)}</div>
                <div class="fclub">${escHtml(right.club)}</div>
              </div>
            </div>
          </div>`;
      })
      .join('');
  }

  const api = { detectScoreChanges, snapshotScores, renderArenasHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KioskArenas = api;
})(typeof window !== 'undefined' ? window : undefined);
