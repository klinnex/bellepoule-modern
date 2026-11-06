/**
 * BellePoule Modern - Arbitre : règles des cartons (extrait de referee.html #1401)
 * Pénalité d'un carton, carton selon le groupe de faute, cartons de passivité (escrime
 * olympique), vainqueur par passivité. Pur, sans DOM. Servi en /js/refereeCards.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /**
   * Escrime olympique : un jaune devient rouge si le tireur a déjà un jaune ou un rouge
   * (un rouge reçu avant tout jaune transforme les jaunes suivants en rouges) (#1026).
   * @param {string[]} standardCards cartons classiques du tireur (hors passivité)
   */
  function modernYellowOrRed(standardCards) {
    return standardCards.some(c => c === 'yellow' || c === 'red') ? 'red' : 'yellow';
  }

  /** Carton attribué selon le groupe de faute (1/2/3) et l'historique du tireur */
  function cardFromGroup(group, ctx) {
    if (ctx.isModern) return group === 2 ? modernYellowOrRed(ctx.standardCards) : 'red';
    const count = (ctx.history && ctx.history[group]) || 0;
    if (group === 1) return count === 0 ? 'white' : 'yellow'; // après blanc et jaune, toujours jaune
    if (group === 2) return count === 0 ? 'yellow' : 'red';
    return 'red'; // Groupe 3 : rouge direct
  }

  /**
   * Effet d'un carton donné.
   * @param {{cardType: string, isModern: boolean, whiteCount: number}} s
   * @returns {{cardType: string, secondWhite: boolean, opponentPoints: number, notify: string|null}}
   *   notify = clé i18n de la notification de pénalité
   */
  function cardEffect(s) {
    let cardType = s.cardType;
    // Conversion 2ème blanc → jaune (chemin sans sélecteur de raison)
    const secondWhite = cardType === 'white' && s.whiteCount >= 1;
    if (secondWhite) cardType = 'yellow';

    let opponentPoints = 0;
    let notify = null;
    if (s.isModern) {
      // jaune = avertissement sans point en escrime moderne
      if (cardType === 'red') {
        opponentPoints = 1;
        notify = 'referee.opp_plus1';
      }
    } else if (cardType === 'yellow') {
      opponentPoints = 3;
      notify = 'referee.opp_plus3';
    } else if (cardType === 'red') {
      opponentPoints = 5;
      notify = 'referee.opp_plus5';
    }
    return { cardType, secondWhite, opponentPoints, notify };
  }

  /** Vibration (ms ou motif) selon le carton */
  function cardVibration(cardType) {
    return cardType === 'red' ? [100, 50, 100] : cardType === 'yellow' ? 80 : 40;
  }

  /** Prochain carton de passivité selon le nombre déjà décerné : P-rouge, P-noir, ou rien (>= 2) */
  function nextPassivityCard(given) {
    if (given >= 2) return null;
    return given === 0 ? 'p-red' : 'p-black';
  }

  /**
   * P-noir : vainqueur = score le plus haut ; à égalité, le mieux classé au départ ;
   * sans classement, tirage au sort.
   * @returns {{action: 'finish', winner: 'A'|'B', reasonKey: string}|{action: 'tiebreak'}}
   */
  function passivityWinner(s) {
    if (s.scoreA !== s.scoreB) {
      return {
        action: 'finish',
        winner: s.scoreA > s.scoreB ? 'A' : 'B',
        reasonKey: 'referee.reason_passivity',
      };
    }
    const rankOf = f => {
      const r = Number(f?.initialRanking ?? f?.ranking);
      return Number.isFinite(r) && r > 0 ? r : null;
    };
    const rA = rankOf(s.fencerA);
    const rB = rankOf(s.fencerB);
    if (rA !== null || rB !== null) {
      const winner = rB === null || (rA !== null && rA < rB) ? 'A' : 'B';
      if (rA !== rB)
        return { action: 'finish', winner, reasonKey: 'referee.reason_passivity_seed' };
    }
    return { action: 'tiebreak' };
  }

  const api = {
    modernYellowOrRed,
    cardFromGroup,
    cardEffect,
    cardVibration,
    nextPassivityCard,
    passivityWinner,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPRefereeCards = api;
})(typeof window !== 'undefined' ? window : undefined);
