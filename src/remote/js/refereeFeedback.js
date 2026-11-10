/**
 * BellePoule Modern - Arbitre : retour sonore optionnel et bouton « Annuler la touche » temporaire (#1539)
 * - Son : désactivé par défaut, activable par #btn-sound (préférence locale `bp_ref_sound`)
 * - Après une touche : bouton d'annulation visible quelques secondes (#undo-toast)
 * Servi en /js/refereeFeedback.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const SOUND_KEY = 'bp_ref_sound';
  const UNDO_MS = 5000;
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

  /**
   * Affiche le bouton d'annulation pour `ms` millisecondes ; un nouvel appel remplace le précédent.
   * @param {Document} doc
   * @param {(k:string)=>string} T traduction
   * @param {() => void} onUndo
   */
  function showUndoToast(doc, T, onUndo, ms, timers) {
    const t = timers || { set: setTimeout, clear: clearTimeout };
    let box = doc.getElementById('undo-toast');
    if (!box) {
      box = doc.createElement('div');
      box.id = 'undo-toast';
      box.className = 'undo-toast';
      box.setAttribute('role', 'group');
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'control-btn btn-undo undo-toast-btn';
      box.appendChild(btn);
      doc.body.appendChild(box);
    }
    const btn = box.firstChild;
    const win = doc.defaultView;
    const icon = win && typeof win.bpIcon === 'function' ? win.bpIcon : () => '';
    const svg = icon('undo');
    btn.textContent = '';
    btn.insertAdjacentHTML('beforeend', svg);
    btn.appendChild(doc.createTextNode((svg ? ' ' : '') + T('referee.undo_touch')));
    btn.onclick = () => {
      hideUndoToast(doc, t);
      onUndo();
    };
    box.hidden = false;
    if (box._timer) t.clear(box._timer);
    box._timer = t.set(() => hideUndoToast(doc, t), ms || UNDO_MS);
    return box;
  }

  function hideUndoToast(doc, timers) {
    const box = doc.getElementById('undo-toast');
    if (!box) return;
    if (box._timer && timers) timers.clear(box._timer);
    box._timer = null;
    box.hidden = true;
  }

  /** À appeler après l'enregistrement d'une touche */
  function afterScore(app, points) {
    const w = root;
    if (!w || !w.document) return;
    let storage = null;
    try {
      storage = w.localStorage;
    } catch (e) {
      storage = null;
    }
    if (readSound(storage)) beep(w, points);
    showUndoToast(
      w.document,
      k => (w.T ? w.T(k) : k),
      () => app.undoLastAction()
    );
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
    if (!doc.querySelector('style[data-bp="ref-feedback"]')) {
      const st = doc.createElement('style');
      st.setAttribute('data-bp', 'ref-feedback');
      st.textContent =
        '.undo-toast{position:fixed;left:0;right:0;bottom:1rem;z-index:50;display:flex;justify-content:center;pointer-events:none}' +
        '.undo-toast[hidden]{display:none}' +
        '.undo-toast-btn{pointer-events:auto;min-height:56px;padding:0.75rem 2rem;box-shadow:var(--shadow-lg)}';
      doc.head.appendChild(st);
    }
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
    showUndoToast,
    hideUndoToast,
    afterScore,
    init,
    SOUND_KEY,
    UNDO_MS,
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
