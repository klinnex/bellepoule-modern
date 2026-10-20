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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escHtml: escHtml, html: html };
  }
})(typeof window !== 'undefined' ? window : globalThis);
