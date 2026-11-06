/**
 * BellePoule Modern - Kiosque : gabarits HTML des vues poules / classement / historique d'entraînement
 * (extrait de kiosk.html #1401). Fonctions pures : chaîne HTML en sortie, escHtml et tk injectés.
 * Servi en /js/kioskRender.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const signed = n => (n >= 0 ? '+' : '') + (n || 0);

  /** Poule terminée : indicateur serveur (forfaits/abandons, #1144) sinon tous les matchs joués */
  function isPoolComplete(pool) {
    const rankings = pool.rankings || [];
    if (typeof pool.isComplete === 'boolean') return pool.isComplete;
    const expectedMatches = Math.max(0, rankings.length - 1);
    return rankings.length > 0 && rankings.every(r => (r.matchesPlayed || 0) >= expectedMatches);
  }

  function noDataHtml(tk, escHtml) {
    return (
      '<div class="no-data"><div class="no-data-icon">🤺</div><h3>' +
      escHtml(tk('kiosk.no_pools')) +
      '</h3><p>' +
      escHtml(tk('kiosk.no_pools_hint')) +
      '</p></div>'
    );
  }

  /** Cartes des poules (ou message « aucune poule ») */
  function poolsHtml(pools, tk, escHtml) {
    if (!pools || pools.length === 0) return noDataHtml(tk, escHtml);
    return pools
      .map(pool => {
        const rankings = pool.rankings || [];
        const isComplete = isPoolComplete(pool);
        const rows = rankings
          .map((r, i) => {
            const ind = signed(r.index);
            const rankClass = i < 3 ? ' rank-' + (i + 1) : '';
            return `<tr>
              <td class="rank-col${rankClass}">${i + 1}</td>
              <td>
                <span class="fencer-name">${escHtml(r.lastName)} ${escHtml(r.firstName || '')}</span><span class="fencer-club">${escHtml(r.club || '')}</span>
              </td>
              <td style="text-align:center;color:#94a3b8">${escHtml(r.matchesPlayed || 0)}</td>
              <td class="victories">${escHtml(r.victories || 0)}</td>
              <td class="ind" style="color:${r.index < 0 ? '#ef4444' : ''}">${escHtml(ind)}</td>
              <td class="td">${escHtml(r.touchesFor || 0)}</td>
            </tr>`;
          })
          .join('');

        return `<div class="pool-card">
            <div class="pool-card-header">
              <h3>${escHtml(pool.number ? tk('kiosk.pool_n', { n: pool.number }) : pool.name || '')}</h3>
              <span class="pool-pill ${isComplete ? '' : 'ongoing'}">${isComplete ? escHtml(tk('kiosk.status_finished')) : escHtml(tk('kiosk.status_ongoing'))}</span>
            </div>
            <table class="pool-table">
              <thead>
                <tr>
                  <th>${escHtml(tk('kiosk.col_rank'))}</th><th>${escHtml(tk('kiosk.col_fencer'))}</th><th>M</th><th>V</th><th>${escHtml(tk('kiosk.col_index'))}</th><th>${escHtml(tk('kiosk.col_ts'))}</th>
                </tr>
              </thead>
              <tbody>${/* html */ rows}</tbody>
            </table>
          </div>`;
      })
      .join('');
  }

  const emptyRow = msg =>
    '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:3rem">' +
    msg +
    '</td></tr>';

  /** Lignes du classement général (ou message d'attente) */
  function rankingRowsHtml(ranking, tk, escHtml) {
    if (!ranking || ranking.length === 0) return emptyRow(escHtml(tk('kiosk.waiting_results')));
    return ranking
      .map((r, i) => {
        const ind = signed(r.index);
        const rankDisplay = `<span style="color:#64748b;font-weight:700">${i + 1}</span>`;
        return `<tr>
            <td>${/* html */ rankDisplay}</td>
            <td>
              <div style="font-weight:500">${escHtml(r.lastName)} ${escHtml(r.firstName || '')}</div>
            </td>
            <td style="color:#64748b;font-size:0.85rem">${escHtml(r.club || '—')}</td>
            <td style="text-align:center;color:#10b981;font-weight:600">${escHtml(r.victories || 0)}</td>
            <td style="text-align:center;color:${r.index < 0 ? '#ef4444' : '#60a5fa'}">${escHtml(ind)}</td>
            <td style="text-align:center;color:#94a3b8">${escHtml(r.touchesFor || 0)}</td>
          </tr>`;
      })
      .join('');
  }

  /** Durée « m:ss » d'un combat d'entraînement, « — » si inconnue */
  function formatBoutDuration(sec) {
    return sec > 0 ? Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') : '—';
  }

  /**
   * Historique des combats d'entraînement (du plus récent au plus ancien, déjà ordonné par l'appelant).
   * @param {(iso: string) => string} formatTime heure locale d'affichage
   */
  function trainingRowsHtml(hist, tk, escHtml, formatTime) {
    if (!hist.length) return emptyRow(escHtml(tk('kiosk.no_finished_bout')));
    return hist
      .map(r => {
        const dur = formatBoutDuration(r.durationSec);
        const t = formatTime(r.finishedAt);
        return `<tr>
              <td style="color:#64748b;font-weight:700">P${escHtml(r.arenaNumber)}</td>
              <td><div style="font-weight:600;font-size:1.1rem">${escHtml(r.scoreA)} — ${escHtml(r.scoreB)}</div></td>
              <td style="color:#64748b;font-size:0.85rem">${escHtml(dur)}</td>
              <td style="text-align:center;color:#94a3b8">${escHtml(t)}</td>
              <td></td><td></td>
            </tr>`;
      })
      .join('');
  }

  const api = { isPoolComplete, poolsHtml, rankingRowsHtml, formatBoutDuration, trainingRowsHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KioskRender = api;
})(typeof window !== 'undefined' ? window : undefined);
