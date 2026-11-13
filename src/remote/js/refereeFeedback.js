/**
 * BellePoule Modern - Arbitre : retour sonore optionnel (#1539) et menu d'options sur téléphone (#1808)
 * - Son : bip court à chaque touche, désactivé par défaut, activable par #btn-sound
 *   (préférence locale `bp_ref_sound`). Distinct de la voix (#btn-tts-toggle, annonces du chrono).
 * - Le bouton « Annuler la touche » temporaire est retiré (#1808) : doublon du bouton « Annuler »
 * Servi en /js/refereeFeedback.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const SOUND_KEY = 'bp_ref_sound';
  const BEEP_HZ = { 1: 660, 3: 880, 5: 1100 };

  function readSound(storage) {
    try {
      return !!storage && storage.getItem(SOUND_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function writeSound(storage, on) {
    try {
      if (storage) storage.setItem(SOUND_KEY, on ? '1' : '0');
    } catch (e) {
      /* préférence valable pour la session seulement */
    }
    return !!on;
  }

  /** Bip court (50 ms) dont la hauteur dépend du palier ; ignoré sans WebAudio */
  function beep(win, points) {
    const AC = win && (win.AudioContext || win.webkitAudioContext);
    if (!AC) return false;
    try {
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = BEEP_HZ[points] || BEEP_HZ[1];
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** À appeler après l'enregistrement d'une touche */
  function afterScore(_app, points) {
    const w = root;
    if (!w || !w.document) return;
    let storage = null;
    try {
      storage = w.localStorage;
    } catch (e) {
      storage = null;
    }
    if (readSound(storage)) beep(w, points);
  }

  /**
   * Vue téléphone (#1808) : #btn-header-menu ouvre/ferme #header-tools (inversion, daltonisme, son).
   * Hors téléphone, le CSS affiche les options en ligne et masque ce bouton.
   */
  function initHeaderMenu(doc) {
    const btn = doc.getElementById('btn-header-menu');
    const tools = doc.getElementById('header-tools');
    if (!btn || !tools) return false;
    const setOpen = open => {
      tools.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    btn.addEventListener('click', e => {
      e.stopPropagation();
      setOpen(!tools.classList.contains('open'));
    });
    doc.addEventListener('click', e => {
      if (tools.classList.contains('open') && !tools.contains(e.target)) setOpen(false);
    });
    doc.addEventListener('keydown', e => {
      if (e.key === 'Escape' && tools.classList.contains('open')) {
        setOpen(false);
        btn.focus();
      }
    });
    return true;
  }

  function paintSoundButton(btn, on) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const win = btn.ownerDocument.defaultView;
    const icon = win && typeof win.bpIcon === 'function' ? win.bpIcon : () => '';
    btn.innerHTML = icon(on ? 'volume-on' : 'volume-off');
  }

  function init(win) {
    const w = win || (typeof window !== 'undefined' ? window : null);
    if (!w || !w.document) return null;
    const doc = w.document;
    initHeaderMenu(doc);
    let storage = null;
    try {
      storage = w.localStorage;
    } catch (e) {
      storage = null;
    }
    const btn = doc.getElementById('btn-sound');
    if (btn) {
      paintSoundButton(btn, readSound(storage));
      btn.addEventListener('click', () => {
        paintSoundButton(btn, writeSound(storage, !readSound(storage)));
      });
    }
    return true;
  }

  const api = {
    readSound,
    writeSound,
    beep,
    afterScore,
    initHeaderMenu,
    init,
    SOUND_KEY,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPRefereeFeedback = api;
  const cs = root && root.document && root.document.currentScript;
  if (cs && cs.hasAttribute('data-bp-init')) {
    if (root.document.readyState === 'loading')
      root.document.addEventListener('DOMContentLoaded', () => init(root));
    else init(root);
  }
})(typeof window !== 'undefined' ? window : undefined);
