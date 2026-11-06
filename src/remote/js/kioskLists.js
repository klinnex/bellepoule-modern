/**
 * BellePoule Modern - Kiosque : classement final et matchs suivants (extrait de kiosk.html #1401)
 * Calcul du classement depuis le tableau (pur) et gabarits HTML (escHtml et tk injectés).
 * Servi en /js/kioskLists.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /**
   * Classement final depuis les données du tableau.
   * @param {object} data tableau {finalResults?, rounds[]}
   * @param {(fencers: object[]) => object[]} sortBySeed départage par classement de poules
   * @returns {{ranked: {rank:number, fencer:object}[]|null}} ranked = null tant que la finale n'est pas jouée
   */
  function computeFinalRanking(data, sortBySeed) {
    // Classement final de l'application : places réelles, sans ex æquo (#1013)
    if (data?.finalResults?.length) {
      return { ranked: [...data.finalResults].sort((a, b) => a.rank - b.rank) };
    }
    if (!data?.rounds?.length) return { ranked: null };

    const finaleMatch = data.rounds.find(r => r.round === 2)?.matches?.[0];
    const pfMatch = data.rounds.find(r => r.round === 3)?.matches?.[0];
    if (!finaleMatch?.winnerId) return { ranked: null };

    // Top 4 depuis finale / petite finale, puis perdants de chaque tour précédent
    const ranked = [];
    const finaleWonByA = finaleMatch.winnerId === finaleMatch.fencerA?.id;
    const winner1 = finaleWonByA ? finaleMatch.fencerA : finaleMatch.fencerB;
    const winner2 = finaleWonByA ? finaleMatch.fencerB : finaleMatch.fencerA;
    if (winner1) ranked.push({ rank: 1, fencer: winner1 });
    if (winner2) ranked.push({ rank: 2, fencer: winner2 });

    if (pfMatch?.winnerId) {
      const pfWonByA = pfMatch.winnerId === pfMatch.fencerA?.id;
      const winner3 = pfWonByA ? pfMatch.fencerA : pfMatch.fencerB;
      const winner4 = pfWonByA ? pfMatch.fencerB : pfMatch.fencerA;
      if (winner3) ranked.push({ rank: 3, fencer: winner3 });
      if (winner4) ranked.push({ rank: 4, fencer: winner4 });
    } else {
      // Petite finale pas encore jouée : les deux perdants de demi-finale se partagent la 3e place
      const sfRound = data.rounds.find(r => r.round === 4);
      if (sfRound) {
        const sfLosers = [];
        sfRound.matches.forEach(m => {
          const loser = m.winnerId === m.fencerA?.id ? m.fencerB : m.winnerId ? m.fencerA : null;
          if (loser) sfLosers.push(loser);
        });
        sortBySeed(sfLosers).forEach((f, i) => ranked.push({ rank: 3 + i, fencer: f }));
      }
    }

    const seen = new Set(ranked.map(r => r.fencer.id));
    const mainRounds = data.rounds
      .filter(r => r.round !== 2 && r.round !== 3)
      .sort((a, b) => a.round - b.round); // croissant : 4, 8, 16, ...
    let currentRank = ranked.length > 0 ? Math.max(...ranked.map(r => r.rank)) + 1 : 5;
    for (const round of mainRounds) {
      const losers = [];
      for (const m of round.matches) {
        if (!m.isBye && m.winnerId) {
          const loser = m.winnerId === m.fencerA?.id ? m.fencerB : m.fencerA;
          if (loser && !seen.has(loser.id)) {
            seen.add(loser.id);
            losers.push(loser);
          }
        }
      }
      // Places distinctes, comme l'application : départage par classement de poules
      sortBySeed(losers).forEach(f => ranked.push({ rank: currentRank++, fencer: f }));
    }
    return { ranked };
  }

  const rankLabel = r => (r <= 4 ? ['🥇', '🥈', '🥉', '4️⃣'][r - 1] : r + 'e');

  function notDoneHtml(tk, escHtml) {
    return (
      '<div class="final-ranking-not-done">' + escHtml(tk('kiosk.not_finished_long')) + '</div>'
    );
  }

  function finalTableHtml(ranked, tk, escHtml) {
    return `<div class="ranking-scroll-wrapper" style="flex:1">
          <table class="ranking-table">
            <thead>
              <tr>
                <th style="width:60px">${escHtml(tk('kiosk.col_rank'))}</th>
                <th>${escHtml(tk('kiosk.col_fencer'))}</th>
                <th>${escHtml(tk('kiosk.col_club'))}</th>
              </tr>
            </thead>
            <tbody>
              ${ranked
                .map(
                  ({ rank, fencer }) => `<tr class="${rank === 1 ? 'top-row' : ''}">
                <td><span class="rank-medal">${escHtml(rankLabel(rank))}</span></td>
                <td style="font-weight:600;font-size:1.1rem">${escHtml(fencer.lastName + ' ' + (fencer.firstName || ''))}</td>
                <td style="color:#64748b">${escHtml(fencer.club || '—')}</td>
              </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`;
  }

  /** « Nom P. » + club (fragments HTML déjà échappés) */
  function suivantFencer(f, escHtml) {
    const name = f
      ? escHtml(f.lastName) + (f.firstName ? ' ' + escHtml(f.firstName[0]) + '.' : '')
      : '?';
    const club = f?.club ? `<span class="fclub">${escHtml(f.club)}</span>` : '';
    return { name, club };
  }

  /** Liste des matchs à venir groupés par poule */
  function suivantsHtml(matches, tk, escHtml) {
    if (!matches || matches.length === 0) {
      return (
        '<div class="no-data"><div class="no-data-icon">📋</div><h3>' +
        escHtml(tk('kiosk.no_next')) +
        '</h3><p>' +
        escHtml(tk('kiosk.no_next_done')) +
        '</p></div>'
      );
    }
    const byPool = new Map();
    for (const m of matches) {
      const key = m.poolNumber
        ? tk('kiosk.pool_n', { n: m.poolNumber })
        : m.poolName || tk('kiosk.no_pool');
      if (!byPool.has(key)) byPool.set(key, []);
      byPool.get(key).push(m);
    }
    let html = '';
    for (const [poolName, poolMatches] of byPool) {
      html += `<div class="suivants-pool-header">${escHtml(poolName)}</div>`;
      for (const m of poolMatches) {
        const { name: nameA, club: clubA } = suivantFencer(m.fencerA, escHtml);
        const { name: nameB, club: clubB } = suivantFencer(m.fencerB, escHtml);
        const isOngoing = m.status === 'in_progress';
        const statusLabel = isOngoing
          ? m.arenaName
            ? escHtml(m.arenaName)
            : escHtml(tk('kiosk.status_ongoing'))
          : escHtml(tk('kiosk.status_upcoming'));
        html += `<div class="suivants-row${isOngoing ? ' ongoing' : ''}">
              <span class="suivants-num">${escHtml(m.number || '')}</span>
              <span class="suivants-fencer">${/* html */ nameA}${/* html */ clubA}</span>
              <span class="suivants-vs">vs</span>
              <span class="suivants-fencer">${/* html */ nameB}${/* html */ clubB}</span>
              <span class="suivants-status${isOngoing ? ' en-cours' : ''}">${/* html */ statusLabel}</span>
            </div>`;
      }
    }
    return html;
  }

  const api = { computeFinalRanking, rankLabel, notDoneHtml, finalTableHtml, suivantsHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KioskLists = api;
})(typeof window !== 'undefined' ? window : undefined);
