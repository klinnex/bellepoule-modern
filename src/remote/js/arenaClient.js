/**
 * BellePoule Modern - Arène : client socket / initialisation (extrait de arena.html #1401)
 * Identifiant d'écran, commandes serveur, état initial et règles olympiques. Stockage et
 * actions injectés. Servi en /js/arenaClient.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /** Identifiant persistant de cet écran (survit aux rechargements/reconnexions) */
  function getOrCreateScreenId(storage, random, now) {
    let id = storage.getItem('bp_screen_id');
    if (!id) {
      id = 'scr_' + random().toString(36).slice(2, 10) + now().toString(36);
      storage.setItem('bp_screen_id', id);
    }
    return id;
  }

  /**
   * Commande serveur (server:command) -> action.
   * @param {object} cmd commande reçue
   * @param {{storage, screenId: string, actions: {reload, navigate, pong, identify, message}}} ctx
   * @returns {boolean} true si la commande est connue
   */
  function dispatchServerCommand(cmd, ctx) {
    const a = ctx.actions;
    if (cmd.type === 'refresh') {
      a.reload();
      return true;
    }
    if (cmd.type === 'navigate' && cmd.url) {
      a.navigate(cmd.url);
      return true;
    }
    if (cmd.type === 'ping') {
      a.pong();
      return true;
    }
    if (cmd.type === 'identify') {
      const label = cmd.screenLabel || ctx.storage.getItem('bp_screen_label') || ctx.screenId;
      if (cmd.screenLabel) ctx.storage.setItem('bp_screen_label', cmd.screenLabel);
      a.identify(label, cmd.duration ?? 5000);
      return true;
    }
    if (cmd.type === 'message' && cmd.text) {
      a.message(cmd.text, cmd.duration ?? 5000);
      return true;
    }
    return false;
  }

  /** État initial de l'arène (GET /api/arenas/:id) -> message de mise à jour, ou null */
  function initialArenaUpdate(arena) {
    if (!(arena && arena.currentMatch && arena.currentMatch.fencerA)) return null;
    return {
      currentMatch: arena.currentMatch,
      status: arena.status,
      scoreA: arena.scoreA,
      scoreB: arena.scoreB,
      fencerA: arena.fencerA,
      fencerB: arena.fencerB,
    };
  }

  /** Escrime olympique (E/F/S ou règles modernes) : libellé « piste » et temps supplémentaire 1 min (#1027) */
  function isOlympicSession(session) {
    return !!session && (['E', 'F', 'S'].includes(session.weapon) || session.modernRules === true);
  }

  const api = { getOrCreateScreenId, dispatchServerCommand, initialArenaUpdate, isOlympicSession };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ArenaClient = api;
})(typeof window !== 'undefined' ? window : undefined);
