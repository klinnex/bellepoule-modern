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
    var el = event.target && event.target.closest ? event.target.closest('[data-' + attr + ']') : null;
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

  if (typeof document !== 'undefined') {
    ['click', 'change', 'input'].forEach(function (type) {
      document.addEventListener(type, function (e) {
        dispatch(e, type);
      });
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escHtml: escHtml, html: html };
  }
})(typeof window !== 'undefined' ? window : globalThis);
