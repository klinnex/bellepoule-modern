/**
 * BellePoule Modern - Arbitre : liste des prochains matchs (extrait de referee.html #1401)
 * Filtrage, fusion et gabarit HTML (escHtml et T injectés : toute donnée dynamique est
 * échappée). Servi en /js/refereeLists.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /** Matchs à jouer ou en cours (réponse de /api/arenas/:id/matches) */
  function pendingMatches(data) {
    return ((data && data.matches) || []).filter(
      m => m.status === 'not_started' || m.status === 'in_progress'
    );
  }

  /** Ajoute à `all` les matchs de `pending` absents (par id) pour que selectMatch() fonctionne (mute) */
  function mergeMatches(all, pending) {
    for (const m of pending) {
      if (!all.find(existing => existing.id === m.id)) all.push(m);
    }
  }

  /** Recherche par nom/prénom des deux tireurs (insensible à la casse) ; requête vide : tout */
  function filterMatches(matches, query) {
    const q = String(query).trim().toLowerCase();
    if (!q) return matches;
    return matches.filter(m => {
      const names = [
        m.fencerA?.lastName,
        m.fencerA?.firstName,
        m.fencerB?.lastName,
        m.fencerB?.firstName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return names.includes(q);
    });
  }

  /**
   * HTML de la liste des prochains matchs.
   * @param {object[]} matches
   * @param {{T: Function, escHtml: Function, arenaNum: string}} ctx
   */
  function renderNextMatchesHtml(matches, ctx) {
    const { T, escHtml, arenaNum } = ctx;
    if (matches.length === 0) {
      return `
              <div class="next-matches-empty">${escHtml(T('referee.all_done'))}</div>
              <div style="display:flex;gap:0.75rem;justify-content:center;margin-top:1.25rem;flex-wrap:wrap;">
                <a href="/arene${escHtml(arenaNum)}/poule" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.85rem 1.5rem;background:#4f46e5;color:#fff;border-radius:0.75rem;font-size:1rem;font-weight:700;text-decoration:none;">
                  ${escHtml(T('referee.signature_btn'))}
                </a>
                <a href="/arene${escHtml(arenaNum)}/journal" target="_blank" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.85rem 1.5rem;background:#4c1d95;color:#c4b5fd;border-radius:0.75rem;font-size:1rem;font-weight:700;text-decoration:none;">
                  ${escHtml(T('referee.journal_btn'))}
                </a>
              </div>`;
    }
    const statusBadge = status => {
      const [bg, key] =
        status === 'in_progress'
          ? ['#f59e0b', 'referee.status_in_progress']
          : ['#3b82f6', 'referee.status_to_play'];
      return (
        '<span style="background:' +
        bg +
        ';color:#fff;font-size:0.7rem;padding:0.15rem 0.4rem;border-radius:0.75rem;margin-left:0.4rem;">' +
        escHtml(T(key)) +
        '</span>'
      );
    };
    return matches
      .map(match => {
        const argsId = escHtml(JSON.stringify([match.id]));
        const clubLine =
          [match.fencerA?.club, match.fencerB?.club].filter(Boolean).map(escHtml).join(' · ') || '';
        return `
              <div class="next-match-card" data-click="refereeApp.selectMatchFromNextScreen" data-args="${/* html */ argsId}">
                <div>
                  <div class="next-match-card-names">
                    ${escHtml(match.fencerA?.lastName) || '?'} <span style="opacity:0.6;font-weight:400">vs</span> ${escHtml(match.fencerB?.lastName) || '?'}
                    ${/* html */ statusBadge(match.status)}
                  </div>
                  <div class="next-match-card-sub">
                    ${/* html */ clubLine}
                  </div>
                </div>
                <div class="next-match-card-arrow">›</div>
              </div>`;
      })
      .join('');
  }

  const api = { pendingMatches, mergeMatches, filterMatches, renderNextMatchesHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPRefereeLists = api;
})(typeof window !== 'undefined' ? window : undefined);
