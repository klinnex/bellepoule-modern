/**
 * BellePoule Modern - Kiosque : tableau compact (extrait de kiosk.html #1401)
 * Géométrie (échelle, colonnes, centres des matchs) et gabarit HTML/SVG du tableau
 * d'élimination directe (escHtml injecté : toute donnée dynamique est échappée).
 * Servi en /js/kioskBracketRender.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /** Badge « T32 · 12/31 » : matchs joués / total (byes exclus) */
  function bracketBadge(data) {
    const pending = data.rounds.reduce(
      (n, r) => n + r.matches.filter(m => m.status !== 'finished' && !m.isBye).length,
      0
    );
    const total = data.rounds.reduce((n, r) => n + r.matches.filter(m => !m.isBye).length, 0);
    return 'T' + data.tableSize + ' · ' + (total - pending) + '/' + total;
  }

  /** Nom court « Dupont J. » (déjà échappé) */
  function shortName(f, escHtml) {
    return escHtml(f.lastName + (f.firstName ? ' ' + f.firstName[0] + '.' : ''));
  }

  /**
   * Construit le tableau compact.
   * @param {object} data {rounds, currentRound}
   * @param {object[]} orderedRounds tours dans l'ordre d'affichage (non vide)
   * @param {{cardW, cardH, colGap, rowGap}} dims dimensions naturelles
   * @param {number} availH hauteur disponible (Infinity en mode ciné : pas de réduction)
   * @param {Function} escHtml
   * @returns {{html: string, layout: object}} layout : géométrie pour le mode ciné et le défilement
   */
  function buildCompactBracket(data, orderedRounds, dims, availH, escHtml) {
    const { cardW, cardH, colGap, rowGap } = dims;
    const firstRound = orderedRounds[0].round; // ex: 16 pour T16
    const cardSlot = cardH + rowGap;

    // Hauteur totale = nombre de matchs du 1er round * cardSlot, réduite pour tenir dans la fenêtre
    let totalH = (firstRound / 2) * cardSlot;
    let scale = 1;
    if (totalH > availH) {
      scale = availH / totalH;
      totalH = availH;
    }
    const sCardW = Math.round(cardW * scale);
    const sCardH = Math.round(cardH * scale);
    const sColGap = Math.round(colGap * scale);
    const totalW = orderedRounds.length * (sCardW + sColGap) + sColGap;
    const labelH = 28;
    const colXOf = ci => ci * (sCardW + sColGap) + sColGap / 2;
    // Y-center d'un match (pos 1-indexée, round = valeur du tour)
    const yCenter = (pos, round) => ((2 * pos - 1) / round) * totalH;

    let cardsHtml = '';
    const connectors = []; // { x1, y1, x2, y2 }

    for (let ci = 0; ci < orderedRounds.length; ci++) {
      const rd = orderedRounds[ci];
      const r = rd.round;
      const colX = colXOf(ci);

      for (const match of rd.matches) {
        if (match.isBye) continue;
        const p = match.position || 1;
        const yc = yCenter(p, r);
        const yTop = Math.round(yc - sCardH / 2);
        const cls = [
          'bracket-match',
          match.status === 'live'
            ? 'match--live'
            : match.status === 'finished'
              ? 'match--finished'
              : 'match--pending',
        ].join(' ');

        const fA = match.fencerA;
        const fB = match.fencerB;
        const nameA = fA ? shortName(fA, escHtml) : '?';
        const nameB = fB ? shortName(fB, escHtml) : r === 2 ? 'TBD' : '?';
        const winA = match.winnerId && fA && match.winnerId === fA.id;
        const winB = match.winnerId && fB && match.winnerId === fB.id;
        const sA = match.scoreA !== null && match.scoreA !== undefined ? match.scoreA : '';
        const sB = match.scoreB !== null && match.scoreB !== undefined ? match.scoreB : '';
        const arenaHtml = match.arenaName
          ? `<div class="bm-arena">${escHtml(match.arenaName)}</div>`
          : '';
        const fontSize = scale < 0.7 ? 'style="font-size:0.62rem"' : '';

        cardsHtml += `<div class="${cls}" style="position:absolute;left:${escHtml(colX)}px;top:${escHtml(yTop)}px;width:${escHtml(sCardW)}px;height:${escHtml(sCardH)}px">
              <div class="bm-row ${winA ? 'bm-winner' : winB ? 'bm-loser' : ''}" ${fontSize}>
                <span class="bm-name">${/* html */ nameA}</span>
                <span class="bm-score">${escHtml(sA)}</span>
              </div>
              <div class="bm-divider"></div>
              ${arenaHtml}
              <div class="bm-row ${winB ? 'bm-winner' : winA ? 'bm-loser' : ''}" ${fontSize}>
                <span class="bm-name">${/* html */ nameB}</span>
                <span class="bm-score">${escHtml(sB)}</span>
              </div>
            </div>`;

        // Connecteurs SVG vers le round suivant (sauf petite finale, round = 3)
        if (ci < orderedRounds.length - 1) {
          const nextRd = orderedRounds[ci + 1];
          if (r !== 3 && nextRd.round !== 3) {
            connectors.push({
              x1: colX + sCardW,
              y1: Math.round(yc),
              x2: colXOf(ci + 1),
              y2: Math.round(yCenter(Math.ceil(p / 2), nextRd.round)),
            });
          }
        }
      }
    }

    // Labels de round
    let labelsHtml = '';
    for (let ci = 0; ci < orderedRounds.length; ci++) {
      const rd = orderedRounds[ci];
      const isActive = rd.round === data.currentRound;
      labelsHtml += `<div class="bracket-round-label${isActive ? ' active-round' : ''}" style="left:${escHtml(colXOf(ci))}px;width:${escHtml(sCardW)}px">${escHtml(rd.label)}</div>`;
    }

    // Chemins SVG
    const svgPaths = connectors
      .map(c => {
        const xMid = Math.round((c.x1 + c.x2) / 2);
        return `<path d="M${escHtml(c.x1)},${escHtml(c.y1)} L${escHtml(xMid)},${escHtml(c.y1)} L${escHtml(xMid)},${escHtml(c.y2)} L${escHtml(c.x2)},${escHtml(c.y2)}" />`;
      })
      .join('');

    // Bandeau du vainqueur de la finale
    const finaleMatch = orderedRounds.find(r => r.round === 2)?.matches?.[0];
    let winnerBanner = '';
    if (finaleMatch?.winnerId && (finaleMatch.fencerA || finaleMatch.fencerB)) {
      const winner =
        finaleMatch.winnerId === finaleMatch.fencerA?.id
          ? finaleMatch.fencerA
          : finaleMatch.fencerB;
      if (winner) {
        winnerBanner = `<div class="bracket-trophy-banner">🏆 ${escHtml(winner.lastName + ' ' + (winner.firstName || ''))}</div>`;
      }
    }

    const html = `
          <div class="bracket-round-labels" style="width:${escHtml(totalW)}px;position:relative;height:${escHtml(labelH)}px;flex-shrink:0;margin-bottom:6px">
            ${labelsHtml}
          </div>
          <div class="bracket-matches-layer" style="position:relative;width:${escHtml(totalW)}px;height:${escHtml(totalH)}px">
            ${cardsHtml}
            <svg class="bracket-svg" width="${escHtml(totalW)}" height="${escHtml(totalH)}"
                 style="position:absolute;top:0;left:0;overflow:visible;pointer-events:none">
              <g stroke="rgba(100,116,139,0.45)" stroke-width="1.5" fill="none">${/* html */ svgPaths}</g>
            </svg>
          </div>
          ${/* html */ winnerBanner}`;

    return {
      html,
      layout: {
        orderedRounds,
        colX: orderedRounds.map((rd, ci) => colXOf(ci)),
        cardW: sCardW,
        cardH: sCardH,
        colGap: sColGap,
        totalW,
        totalH,
        matchTop: labelH + 6, // décalage de la couche matchs sous les labels
        innerH: labelH + 6 + totalH,
        yCenter,
        currentRound: data.currentRound,
      },
    };
  }

  const api = { bracketBadge, buildCompactBracket };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KioskBracketRender = api;
})(typeof window !== 'undefined' ? window : undefined);
