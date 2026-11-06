/**
 * BellePoule Modern - Kiosque : chargement des données et vues actives (extrait de kiosk.html #1401)
 * Séquence de requêtes HTTP (fetch injecté) avec rendu progressif via rappels, comme à l'origine.
 * Servi en /js/kioskData.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /** 'final' (classement final) désactivé par défaut s'il n'est pas explicitement présent */
  function viewDefault(src, view) {
    return view === 'final' ? src[view] === true : src[view] !== false;
  }

  /**
   * Cases à cocher des vues : réglage local en priorité, sinon config serveur (premier chargement).
   * @returns {Object<string, boolean>|null} null si aucune source
   */
  function resolveViewChecks(allViews, localViews, serverViews) {
    const src = localViews || serverViews;
    if (!src) return null;
    const out = {};
    allViews.forEach(v => {
      out[v] = viewDefault(src, v);
    });
    return out;
  }

  /**
   * Charge session, poules/classements (ou historique entraînement), arènes et matchs suivants.
   * Chaque rappel est appelé dès que sa réponse est reçue (rendu progressif).
   * @param {Function} fetchFn fetch
   * @param {{onSession, onTraining, onPools, onArenas, onUpcoming}} h
   * @returns {Promise<boolean>} false si pas de session active
   */
  async function loadKioskData(fetchFn, h) {
    const sessRes = await fetchFn('/api/session');
    if (!sessRes.ok) return false;
    const session = await sessRes.json();
    h.onSession(session);

    if (session.competitionId === '__training__') {
      const histRes = await fetchFn('/api/training/history');
      if (histRes.ok) h.onTraining((await histRes.json()).history || []);
    } else {
      const poolsRes = await fetchFn(
        '/api/competitions/' + session.competitionId + '/results-data'
      );
      if (poolsRes.ok) {
        const data = await poolsRes.json();
        h.onPools(
          data.pools || [],
          data.overallRanking && data.overallRanking.length > 0 ? data.overallRanking : null
        );
      }
    }

    const arenasRes = await fetchFn('/api/arenas');
    if (arenasRes.ok) h.onArenas(await arenasRes.json());

    const upRes = await fetchFn('/api/session/upcoming-matches');
    if (upRes.ok) h.onUpcoming((await upRes.json()).upcoming || []);
    return true;
  }

  const api = { viewDefault, resolveViewChecks, loadKioskData };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KioskData = api;
})(typeof window !== 'undefined' ? window : undefined);
