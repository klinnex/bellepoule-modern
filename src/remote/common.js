/**
 * BellePoule Modern - Utilitaires partagés par les pages distantes (#1147)
 *
 * Chargé avant les scripts de page (`<script src="/common.js"></script>`).
 * - escHtml(v)  : échappe &, <, >, ", ' et ` (null/undefined → '', 0 → '0')
 * - html`...`   : gabarit qui échappe chaque interpolation par défaut ; html.raw(s) marque un
 *                 fragment déjà sûr, un tableau est concaténé élément par élément
 *
 * Règle : toute donnée issue d'un tireur, d'un club, d'un arbitre ou du réseau passe par escHtml
 * (ou html``) avant d'entrer dans innerHTML. Le cliquet qualité (`npm run check:quality`,
 * compteur remoteUnescaped) refuse toute nouvelle interpolation non échappée.
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  var ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;',
  };

  function escHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"'`]/g, function (c) {
      return ESCAPES[c];
    });
  }

  function SafeHtml(value) {
    this.value = value;
  }
  SafeHtml.prototype.toString = function () {
    return this.value;
  };

  function toHtml(value) {
    if (value instanceof SafeHtml) return value.value;
    if (Array.isArray(value)) return value.map(toHtml).join('');
    return escHtml(value);
  }

  /** Fragment HTML déjà sûr (à n'utiliser que sur du HTML construit localement) */
  function raw(value) {
    return new SafeHtml(String(value == null ? '' : value));
  }

  /** Gabarit étiqueté : escapes par défaut, html.raw() pour un fragment de confiance */
  function html(strings) {
    var out = strings[0];
    for (var i = 1; i < arguments.length; i++) {
      out += toHtml(arguments[i]) + strings[i];
    }
    return new SafeHtml(out);
  }
  html.raw = raw;

  root.escHtml = escHtml;
  root.escapeHtml = escHtml;
  root.html = html;
  root.bpResolveAction = resolvePath;

  /**
   * Délégation d'événements (#1149) : remplace les onclick/onchange/oninput inline, interdits
   * par la CSP (script-src sans 'unsafe-inline').
   *   <button data-click="refereeApp.undo" data-args='["A"]'>
   * data-click | data-change | data-input = chemin pointé résolu depuis window ; data-args = tableau
   * JSON, "$el" = l'élément, "$value" = sa valeur. Les fonctions de page restent globales.
   */
  function resolvePath(path) {
    var parts = String(path).split('.');
    var parent = root;
    var fn = root;
    for (var i = 0; i < parts.length; i++) {
      parent = fn;
      fn = fn == null ? undefined : fn[parts[i]];
    }
    return typeof fn === 'function' ? { fn: fn, parent: parent } : null;
  }

  function dispatch(event, attr) {
    var el =
      event.target && event.target.closest ? event.target.closest('[data-' + attr + ']') : null;
    if (!el) return;
    var target = resolvePath(el.getAttribute('data-' + attr));
    if (!target) return;
    var args = [];
    var raw = el.getAttribute('data-args');
    if (raw) {
      try {
        args = JSON.parse(raw);
      } catch (e) {
        args = [];
      }
      args = args.map(function (a) {
        return a === '$el' ? el : a === '$value' ? el.value : a;
      });
    }
    if (attr === 'click' && el.tagName === 'A') event.preventDefault();
    target.fn.apply(target.parent, args);
  }

  /**
   * Taille d'affichage (#1156) : `?scale=1.3` (0.5 à 3) agrandit la page — kiosque lu à
   * distance, tablette arbitre. Mémorisée sur l'appareil ; `?scale=1` revient à la normale.
   */
  function applyScale() {
    var scale;
    try {
      var param = new URLSearchParams(location.search).get('scale');
      if (param !== null) {
        scale = Number(param);
        localStorage.setItem('bp_ui_scale', String(scale));
      } else {
        scale = Number(localStorage.getItem('bp_ui_scale'));
      }
    } catch (e) {
      scale = NaN;
    }
    if (scale >= 0.5 && scale <= 3 && scale !== 1)
      document.documentElement.style.zoom = String(scale);
  }

  if (typeof document !== 'undefined' && typeof location !== 'undefined') applyScale();

  if (typeof document !== 'undefined') {
    ['click', 'change', 'input'].forEach(function (type) {
      document.addEventListener(type, function (e) {
        dispatch(e, type);
      });
    });
  }

  /** Identifiant persistant de la tablette (survit aux rechargements), `null` sans stockage. */
  function screenId() {
    try {
      var id = localStorage.getItem('bp_screen_id');
      if (!id) {
        id = 'scr_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem('bp_screen_id', id);
      }
      return id;
    } catch (e) {
      return null;
    }
  }
  root.bpScreenId = screenId;

  /**
   * Tournoi des rapières (#1118) : sous-piste attribuée à cette tablette arbitre pendant
   * les vagues (plusieurs matchs d'une même piste en simultané), sinon la piste elle-même.
   * Résout `current` (ou la piste) si le serveur est injoignable ou refuse.
   */
  /**
   * Clé de sous-piste propre à l'onglet (sessionStorage : survit au rechargement, distincte
   * entre deux onglets d'un même navigateur, qui partagent `bp_screen_id`) (#1118).
   */
  function slotKey() {
    try {
      var id = sessionStorage.getItem('bp_slot_key');
      if (!id) {
        id = 'tab_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        sessionStorage.setItem('bp_slot_key', id);
      }
      return id;
    } catch (e) {
      return screenId();
    }
  }

  function claimArenaSlot(baseId, current) {
    var fallback = current || baseId;
    var key = slotKey();
    if (!key || typeof fetch !== 'function') return Promise.resolve(fallback);
    return fetch('/api/arenas/' + encodeURIComponent(baseId) + '/slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceKey: key, current: current }),
    })
      .then(function (r) {
        return r.ok ? r.json() : { arenaId: fallback };
      })
      .then(function (d) {
        var id = d && d.arenaId;
        return typeof id === 'string' && /^arena\d+(s\d+)?$/.test(id) ? id : fallback;
      })
      .catch(function () {
        return fallback;
      });
  }
  root.bpClaimArenaSlot = claimArenaSlot;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escHtml: escHtml, html: html, claimArenaSlot: claimArenaSlot };
  }
})(typeof window !== 'undefined' ? window : globalThis);
