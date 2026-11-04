/**
 * BellePoule Modern - Kiosque : calculs purs du tableau / classement (extrait de kiosk.html #1401)
 * Aucun accès au DOM ni à l'état global : tout est passé en paramètre. Servi en /js/kioskBracketUtils.js.
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /** Nombre de matchs du 1er tour au-delà duquel le mode « focus » s'active en auto */
  const FOCUS_THRESHOLD = 16;

  /** Agrège les classements des poules en un classement général (victoires, indice, touches données) */
  function buildOverallRanking(poolsData) {
    const map = new Map();
    for (const pool of poolsData || []) {
      for (const r of pool.rankings || []) {
        const key = r.id || r.lastName + '_' + r.firstName;
        if (!map.has(key)) {
          map.set(key, {
            ...r,
            victories: 0,
            index: 0,
            touchesFor: 0,
            touchesAgainst: 0,
            matchCount: 0,
          });
        }
        const entry = map.get(key);
        entry.victories += r.victories || 0;
        entry.index += r.index || 0;
        entry.touchesFor += r.touchesFor || 0;
        entry.touchesAgainst += r.touchesAgainst || 0;
        entry.matchCount += r.matchCount || 0;
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (b.victories !== a.victories) return b.victories - a.victories;
      if (b.index !== a.index) return b.index - a.index;
      return b.touchesFor - a.touchesFor;
    });
  }

  /** Trie des tireurs selon le classement général des poules (meilleur classé d'abord) */
  function sortBySeed(fencers, overallRanking) {
    const seed = new Map(
      (overallRanking || []).map((r, i) => [r.fencerId ?? r.fencer?.id ?? r.id, i])
    );
    return [...fencers].sort((a, b) => (seed.get(a.id) ?? 9999) - (seed.get(b.id) ?? 9999));
  }

  function clampNum(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /** Tours principaux décroissants (32, 16, …, 2), puis la petite finale (round 3) à la fin */
  function getBracketRoundOrder(rounds) {
    const main = rounds.filter(r => r.round !== 3).sort((a, b) => b.round - a.round);
    const pf = rounds.find(r => r.round === 3);
    return pf ? [...main, pf] : main;
  }

  /** Dimensions des cartes selon la taille du tableau */
  function getBracketDims(data) {
    const n = data.rounds.length > 0 ? data.rounds[0].round : 8;
    if (n <= 8) return { cardW: 210, cardH: 66, colGap: 70, rowGap: 10 };
    if (n <= 16) return { cardW: 188, cardH: 60, colGap: 62, rowGap: 8 };
    if (n <= 32) return { cardW: 158, cardH: 52, colGap: 54, rowGap: 6 };
    return { cardW: 130, cardH: 44, colGap: 46, rowGap: 4 };
  }

  /** Mode focus (un tour à la fois) : forcé, interdit, ou auto si le 1er tour dépasse le seuil */
  function isFocusMode(data, displayMode) {
    if (!data?.rounds?.length) return false;
    if (displayMode === 'focus') return true;
    if (displayMode === 'compact' || displayMode === 'cinema') return false;
    const orderedRounds = getBracketRoundOrder(data.rounds);
    if (!orderedRounds.length) return false;
    return orderedRounds[0].round / 2 > FOCUS_THRESHOLD;
  }

  /**
   * Plans du mode ciné : vue d'ensemble, puis un plan (ou scan vertical) par tour en cours.
   * @param {object} L mise en page {totalW, innerH, cardW, colX[], orderedRounds[]}
   * @param {{overviewMs:number, roundMs:number, scanFrac:number}} cinema durées
   */
  function buildCinemaFrames(L, vw, vh, cinema) {
    const frames = [];
    const overviewScale = Math.min(vw / L.totalW, vh / L.innerH) * 0.95;
    frames.push({
      tx: (vw - L.totalW * overviewScale) / 2,
      ty: (vh - L.innerH * overviewScale) / 2,
      scale: overviewScale,
      transMs: 1200,
      holdMs: cinema.overviewMs,
    });

    // Un tour dont tous les matchs sont joués est ignoré (#1139)
    const activeCols = [];
    (L.orderedRounds || []).forEach((rd, ci) => {
      const ongoing = rd.matches.some(
        m => !m.isBye && m.fencerA && m.fencerB && m.status !== 'finished'
      );
      if (ongoing) activeCols.push(ci);
    });
    if (activeCols.length === 0) L.colX.forEach((_, ci) => activeCols.push(ci));
    for (const i of activeCols) {
      const colCenterX = L.colX[i] + L.cardW / 2;
      const sc = clampNum((vw * 0.32) / L.cardW, overviewScale * 1.25, 1.5);
      const tx = vw / 2 - colCenterX * sc;
      const contentH = L.innerH * sc;
      const scanMs = Math.round(cinema.roundMs * cinema.scanFrac);
      const holdMs = Math.round((cinema.roundMs - scanMs) / 2);
      if (contentH <= vh) {
        frames.push({
          tx,
          ty: (vh - contentH) / 2,
          scale: sc,
          transMs: 1100,
          holdMs: cinema.roundMs,
        });
      } else {
        frames.push({ tx, ty: 0, scale: sc, transMs: 1100, holdMs });
        frames.push({ tx, ty: vh - contentH, scale: sc, transMs: scanMs, holdMs });
      }
    }
    return frames;
  }

  const api = {
    FOCUS_THRESHOLD,
    buildOverallRanking,
    sortBySeed,
    clampNum,
    getBracketRoundOrder,
    getBracketDims,
    isFocusMode,
    buildCinemaFrames,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KioskBracket = api;
})(typeof window !== 'undefined' ? window : undefined);
