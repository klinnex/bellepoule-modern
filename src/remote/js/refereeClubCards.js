/**
 * BellePoule Modern - Arbitre : identification des tireurs par leur carte de club (#1872).
 * Séance du Mode Club reliée au serveur d'entraînement : à l'arrivée sur la piste, la tablette
 * demande la carte du tireur A puis celle du tireur B (caméra ou code en clair), chacune
 * pouvant être passée. Deux cartes : combat enregistré dans la séance ; sinon combat libre.
 * Caméra : BarcodeDetector si disponible, sinon jsQR (/js/jsQR.js) ; HTTPS requis.
 * Script classique : window.BPRefereeClubCards. Servi en /js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  var DONE_PARAM = 'club';
  var CODE_RE = /^[0-9A-F]{10}$/;

  function tr(key, fallback, params) {
    var s = root && root.T ? root.T(key, params) : null;
    return s && s !== key ? s : fallback;
  }

  /** Texte lu (QR `BPC1:M:<code>` ou code saisi) → code carte, sinon null */
  function parseCard(text) {
    if (typeof text !== 'string') return null;
    var t = text.trim().toUpperCase();
    var parts = t.split(':');
    if (parts.length === 3 && parts[0] === 'BPC1' && parts[1] === 'M') t = parts[2];
    return CODE_RE.test(t) ? t : null;
  }

  /** Numéro de piste de l'URL (/areneN/arbitre), null si absent */
  function arenaFromPath(pathname) {
    var m = /arene(\d+)/i.exec(pathname || '') || /arena(\d+)/i.exec(pathname || '');
    return m ? Number(m[1]) : null;
  }

  /** Identification déjà faite (retour après lancement du combat) */
  function alreadyDone(search) {
    return new URLSearchParams(search || '').get(DONE_PARAM) === '1';
  }

  function el(doc, tag, css, text) {
    var e = doc.createElement(tag);
    if (css) e.style.cssText = css;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ─── Lecture caméra ─────────────────────────────────────────────────────────

  /** Caméra accessible : contexte sécurisé (HTTPS ou localhost) et getUserMedia présent */
  function cameraUsable(win) {
    var md = win && win.navigator && win.navigator.mediaDevices;
    return !!(win && win.isSecureContext && md && md.getUserMedia);
  }

  var jsQrPromise = null;
  function loadJsQr(win) {
    if (win.jsQR) return Promise.resolve(win.jsQR);
    if (!jsQrPromise) {
      jsQrPromise = new Promise(function (resolve) {
        var s = win.document.createElement('script');
        s.src = '/js/jsQR.js';
        s.onload = function () {
          resolve(win.jsQR || null);
        };
        s.onerror = function () {
          resolve(null);
        };
        win.document.head.appendChild(s);
      });
    }
    return jsQrPromise;
  }

  /**
   * Démarre la caméra arrière dans `video` et appelle onText(texte) à chaque QR lu.
   * Renvoie une fonction d'arrêt, ou null si la caméra est indisponible.
   */
  async function startCamera(win, video, onText) {
    if (!cameraUsable(win)) return null;
    var stream;
    try {
      stream = await win.navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch (_) {
      return null;
    }
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    try {
      await video.play();
    } catch (_) {
      /* lecture automatique refusée : l'image reste disponible */
    }
    var detector = null;
    if (win.BarcodeDetector) {
      try {
        detector = new win.BarcodeDetector({ formats: ['qr_code'] });
      } catch (_) {
        detector = null;
      }
    }
    var decode = detector ? null : await loadJsQr(win);
    var canvas = win.document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var stopped = false;
    var timer = null;
    async function tick() {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          if (detector) {
            var codes = await detector.detect(video);
            if (codes && codes[0] && codes[0].rawValue) onText(codes[0].rawValue);
          } else if (decode && ctx) {
            var w = video.videoWidth;
            var h = video.videoHeight;
            if (w && h) {
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              var img = ctx.getImageData(0, 0, w, h);
              var qr = decode(img.data, w, h, { inversionAttempts: 'dontInvert' });
              if (qr && qr.data) onText(qr.data);
            }
          }
        }
      } catch (_) {
        /* image illisible : on réessaie */
      }
      if (!stopped) timer = win.setTimeout(tick, 250);
    }
    tick();
    return function stop() {
      stopped = true;
      if (timer) win.clearTimeout(timer);
      stream.getTracks().forEach(function (t) {
        t.stop();
      });
      video.srcObject = null;
    };
  }

  // ─── Fenêtre d'identification ───────────────────────────────────────────────

  /**
   * Demande la carte d'un tireur. Résout le code lu, null si passé, ou 'cancel'
   * (identification abandonnée : la piste garde son combat libre).
   */
  function askCard(win, side, clubName, errorText) {
    var doc = win.document;
    return new Promise(function (resolve) {
      var overlay = el(
        doc,
        'div',
        'position:fixed;inset:0;z-index:10000;background:var(--slate-900);color:var(--color-white);' +
          'display:flex;align-items:center;justify-content:center;padding:16px;'
      );
      overlay.id = 'club-card-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      var box = el(
        doc,
        'div',
        'width:min(480px,100%);display:flex;flex-direction:column;gap:12px;align-items:stretch;' +
          'text-align:center;font-family:Inter,system-ui,sans-serif;'
      );
      if (clubName) box.appendChild(el(doc, 'div', 'opacity:0.75;font-size:14px;', clubName));
      var title = el(
        doc,
        'h2',
        'margin:0;font-size:24px;color:' +
          (side === 'A' ? 'var(--tw-red-400)' : 'var(--tw-green-400)') +
          ';',
        side === 'A'
          ? tr('referee.club_card_a', 'Carte du tireur A')
          : tr('referee.club_card_b', 'Carte du tireur B')
      );
      overlay.setAttribute('aria-label', title.textContent);
      box.appendChild(title);
      var hint = el(
        doc,
        'p',
        'margin:0;opacity:0.85;',
        tr('referee.club_card_hint', 'Présentez le QR code de la carte de club à la caméra.')
      );
      box.appendChild(hint);
      var video = el(
        doc,
        'video',
        'width:100%;max-height:45vh;background:var(--slate-800);border-radius:12px;object-fit:cover;'
      );
      box.appendChild(video);
      var error = el(
        doc,
        'p',
        'margin:0;color:var(--tw-red-200);min-height:1.2em;',
        errorText || ''
      );
      error.setAttribute('role', 'alert');
      box.appendChild(error);
      var row = el(doc, 'form', 'display:flex;gap:8px;');
      var input = el(
        doc,
        'input',
        'flex:1;min-width:0;padding:10px;border-radius:8px;border:1px solid var(--slate-600);' +
          'background:var(--slate-800);color:var(--color-white);font-size:18px;letter-spacing:2px;text-transform:uppercase;'
      );
      input.maxLength = 40;
      input.autocomplete = 'off';
      input.placeholder = tr('referee.club_card_code', 'Code de la carte');
      input.setAttribute('aria-label', input.placeholder);
      var ok = el(
        doc,
        'button',
        'padding:10px 16px;border-radius:8px;border:none;background:var(--blue-600);color:var(--color-white);font-size:16px;',
        tr('referee.club_card_ok', 'Valider')
      );
      ok.type = 'submit';
      row.appendChild(input);
      row.appendChild(ok);
      box.appendChild(row);
      var actions = el(doc, 'div', 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;');
      var skip = el(
        doc,
        'button',
        'padding:10px 16px;border-radius:8px;border:1px solid var(--slate-500);background:transparent;' +
          'color:var(--color-white);font-size:16px;',
        tr('referee.club_card_skip', 'Passer (tireur non identifié)')
      );
      skip.type = 'button';
      var cancel = el(
        doc,
        'button',
        'padding:10px 16px;border-radius:8px;border:none;background:transparent;color:var(--slate-400);font-size:14px;',
        tr('referee.club_card_cancel', 'Arbitrer sans cartes')
      );
      cancel.type = 'button';
      actions.appendChild(skip);
      actions.appendChild(cancel);
      box.appendChild(actions);
      overlay.appendChild(box);
      doc.body.appendChild(overlay);

      var stopCam = null;
      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        if (stopCam) stopCam();
        overlay.remove();
        resolve(value);
      }
      function tryText(text) {
        var code = parseCard(text);
        if (code) finish(code);
        else error.textContent = tr('referee.club_card_invalid', 'Carte non reconnue');
      }
      row.addEventListener('submit', function (e) {
        e.preventDefault();
        tryText(input.value);
      });
      skip.addEventListener('click', function () {
        finish(null);
      });
      cancel.addEventListener('click', function () {
        finish('cancel');
      });
      startCamera(win, video, tryText).then(function (stop) {
        if (done) {
          if (stop) stop();
          return;
        }
        stopCam = stop;
        if (!stop) {
          video.style.display = 'none';
          hint.textContent = tr(
            'referee.club_card_no_camera',
            'Caméra indisponible : saisissez le code imprimé sous le QR code.'
          );
          input.focus();
        }
      });
    });
  }

  function errorMessage(res) {
    switch (res && res.error) {
      case 'unknown_card':
        return tr('referee.club_card_unknown', 'Carte inconnue dans ce club');
      case 'same_member':
        return tr('referee.club_card_same', 'Les deux cartes sont celles du même tireur');
      case 'busy':
        return tr('referee.club_card_busy', 'Un combat est en cours sur cette piste');
      default:
        return tr('referee.club_card_error', "Le combat n'a pas pu être lancé");
    }
  }

  /** Cartes A puis B ; erreur serveur : on recommence en indiquant le motif */
  async function identify(win, arena, clubName) {
    var message = '';
    for (var attempt = 0; attempt < 5; attempt++) {
      var a = await askCard(win, 'A', clubName, message);
      if (a === 'cancel') return false;
      var b = await askCard(win, 'B', clubName, '');
      if (b === 'cancel') return false;
      if (a === null && b === null) return false; // aucune carte : combat libre inchangé
      var res = null;
      try {
        var r = await win.fetch('/api/club/identify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ arena: arena, codeA: a, codeB: b }),
        });
        res = await r.json();
      } catch (_) {
        res = null;
      }
      if (res && res.ok) return true;
      message = errorMessage(res);
    }
    return false;
  }

  /** Recharge la page arbitre sur le combat lancé (ouvert directement, sans redemander) */
  function reloadOnMatch(win) {
    var url = new URL(win.location.href);
    url.searchParams.set('lobby', '1');
    url.searchParams.set(DONE_PARAM, '1');
    win.location.replace(url.pathname + url.search + url.hash);
  }

  /** Bouton « Cartes » à côté de Retour / Lobby : nouvelle identification */
  function addButton(doc, onClick) {
    var back = doc.getElementById('btn-back-to-list');
    if (!back || !back.parentNode || doc.getElementById('btn-club-cards')) return null;
    var btn = doc.createElement('button');
    btn.id = 'btn-club-cards';
    btn.type = 'button';
    btn.className = back.className;
    btn.textContent = tr('referee.club_cards', 'Cartes');
    btn.title = tr('referee.club_cards_title', 'Identifier les tireurs par leur carte de club');
    btn.addEventListener('click', onClick);
    back.parentNode.insertBefore(btn, back);
    return btn;
  }

  /**
   * Démarre l'identification si une séance du club est reliée. Résout `false` sinon
   * (hors Mode Club, démo, page sans piste). Sans caméra (HTTP) : pas de fenêtre à
   * l'ouverture, l'interface d'arbitrage s'affiche ; bouton « Cartes » pour saisir les codes.
   */
  async function install(win, app) {
    var arena = arenaFromPath(win.location.pathname);
    if (arena === null) return false;
    var params = new URLSearchParams(win.location.search);
    if (params.get('demo') === '1') return false;
    var info;
    try {
      info = await (await win.fetch('/api/club/identify')).json();
    } catch (_) {
      return false;
    }
    if (!info || !info.active) return false;
    var clubName = typeof info.club === 'string' ? info.club : '';
    var running = false;
    async function run() {
      var a = app && app();
      if (running || (a && a.timerRunning)) return;
      running = true;
      try {
        if (await identify(win, arena, clubName)) reloadOnMatch(win);
      } finally {
        running = false;
      }
    }
    addButton(win.document, run);
    if (!alreadyDone(win.location.search) && cameraUsable(win)) run();
    return true;
  }

  var api = {
    parseCard: parseCard,
    arenaFromPath: arenaFromPath,
    alreadyDone: alreadyDone,
    cameraUsable: cameraUsable,
    errorMessage: errorMessage,
    addButton: addButton,
    install: install,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPRefereeClubCards = api;
})(typeof window !== 'undefined' ? window : undefined);
