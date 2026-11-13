/**
 * BellePoule Modern - Arbitre : lien avec le lobby du mode entraînement (#1500).
 * Hors entraînement : aucun effet. En entraînement : occupe la piste, remplace « Retour » par « Lobby »
 * (même style, #1808), signale l'activité, libère la piste au retour lobby, à la
 * fermeture de la page et après 3 minutes d'inactivité (retour forcé vers le lobby).
 * Script classique : window.BPRefereeLobby. Servi en /js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  var LOBBY_URL = '/entrainement-lobby';
  var IDLE_MS = 3 * 60 * 1000;
  var TOUCH_EVERY_MS = 30 * 1000;
  var CLIENT_KEY = 'bp_training_client';

  /** Identifiant propre à l'onglet (sessionStorage), conservé au rechargement */
  function clientId(storage, rand) {
    var id = null;
    try {
      id = storage.getItem(CLIENT_KEY);
    } catch (_) {
      /* stockage indisponible */
    }
    if (id && /^[\w-]{8,64}$/.test(id)) return id;
    id = 'c' + (rand || Math.random)().toString(36).slice(2, 12) + Date.now().toString(36);
    try {
      storage.setItem(CLIENT_KEY, id);
    } catch (_) {
      /* stockage indisponible */
    }
    return id;
  }

  /** Numéro de piste de l'URL (/areneN/arbitre), null si absent */
  function arenaFromPath(pathname) {
    var m = /arene(\d+)/i.exec(pathname) || /arena(\d+)/i.exec(pathname);
    return m ? Number(m[1]) : null;
  }

  /** Suivi d'inactivité : expire IDLE_MS après la dernière activité (ou si `busy()`) */
  function createIdleTracker(now, idleMs, busy) {
    var last = now();
    return {
      activity: function () {
        last = now();
      },
      /** Vrai quand la piste doit être rendue (le chrono en cours compte comme activité) */
      expired: function () {
        if (busy && busy()) last = now();
        return now() - last >= (idleMs || IDLE_MS);
      },
    };
  }

  function post(win, path, body, beacon) {
    var json = JSON.stringify(body);
    if (beacon && win.navigator && win.navigator.sendBeacon) {
      return win.navigator.sendBeacon(path, new Blob([json], { type: 'application/json' }));
    }
    return win.fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true,
    });
  }

  /** Arrivée depuis le lobby (?lobby=1) : ouvrir directement la vue arbitre du match */
  function fromLobby(search) {
    return new URLSearchParams(search || '').get('lobby') === '1';
  }

  /** Match à ouvrir : en cours d'abord, sinon le premier à jouer ; null si aucun */
  function pickMatch(matches) {
    var list = matches || [];
    for (var i = 0; i < list.length; i++) if (list[i].status === 'in_progress') return list[i];
    for (var j = 0; j < list.length; j++) if (list[j].status === 'not_started') return list[j];
    return null;
  }

  /**
   * Ouvre le match de la piste dès la liste chargée (`app().allMatches`), une seule fois.
   * Le paramètre ?lobby=1 est retiré de l'URL : « Retour » (rechargement) garde la liste.
   */
  function autoOpen(win, app, tries) {
    try {
      var url = new URL(win.location.href);
      url.searchParams.delete('lobby');
      win.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (_) {
      /* URL non modifiable : sans effet */
    }
    var left = tries || 50;
    return new Promise(function (resolve) {
      function check() {
        var a = app && app();
        if (a && a.currentMatch) return resolve(false); // déjà sur un match
        // allMatches vaut [] avant le premier chargement : attendre la vraie liste (#1500)
        if (a && a.matchesLoaded && a.allMatches) {
          var m = pickMatch(a.allMatches);
          if (m) a.selectMatchFromNextScreen(m.id);
          return resolve(!!m);
        }
        if (--left <= 0) return resolve(false);
        win.setTimeout(check, 200);
      }
      check();
    });
  }

  /**
   * Entraînement (#1808) : « Lobby » prend la place de « Retour » (masqué) avec le même style
   */
  function addButton(doc, onClick) {
    var back = doc.getElementById('btn-back-to-list');
    if (!back || !back.parentNode || doc.getElementById('btn-lobby')) return null;
    var row = back.parentNode;
    var btn = doc.createElement('button');
    btn.id = 'btn-lobby';
    btn.type = 'button';
    btn.className = back.className;
    back.hidden = true;
    back.style.display = 'none';
    btn.textContent = root && root.T ? root.T('referee.lobby') : '← Lobby';
    btn.title = root && root.T ? root.T('referee.lobby_title') : 'Lobby';
    btn.addEventListener('click', onClick);
    row.insertBefore(btn, back);
    return btn;
  }

  /**
   * Démarre le lien lobby. `app()` renvoie l'instance RefereeApp (chrono en cours = actif).
   * Résout `false` hors mode entraînement.
   */
  async function install(win, app) {
    var doc = win.document;
    var arena = arenaFromPath(win.location.pathname);
    if (arena === null) return false;
    // Miroir de démo (?demo=1) : simple spectateur, il ne prend jamais la piste
    if (new URLSearchParams(win.location.search).get('demo') === '1') return false;
    var info;
    try {
      info = await (await win.fetch('/api/training/lobby')).json();
    } catch (_) {
      return false;
    }
    if (!info || !info.training) return false;

    var id = clientId(win.sessionStorage);
    var body = { arena: arena, clientId: id };
    var res = await post(win, '/api/training/lobby/claim', body);
    if (res.status === 409) {
      win.location.replace(LOBBY_URL + '?occupied=' + arena); // piste déjà tenue
      return true;
    }

    var released = false;
    function release(beacon) {
      if (released) return;
      released = true;
      post(win, '/api/training/lobby/release', body, beacon);
    }
    function goLobby() {
      release(false);
      win.location.href = LOBBY_URL;
    }

    addButton(doc, goLobby);
    if (fromLobby(win.location.search)) autoOpen(win, app);

    var tracker = createIdleTracker(Date.now, info.idleMs || IDLE_MS, function () {
      var a = app && app();
      return !!(a && a.timerRunning);
    });
    var lastTouch = Date.now();
    function onActivity() {
      tracker.activity();
      if (released || Date.now() - lastTouch >= TOUCH_EVERY_MS) {
        released = false; // page restaurée après pagehide : on reprend la piste
        lastTouch = Date.now();
        post(win, '/api/training/lobby/claim', body);
      }
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      doc.addEventListener(ev, onActivity, { passive: true, capture: true });
    });

    // Chrono en cours sans interaction : on rafraîchit côté serveur, sinon retour forcé
    win.setInterval(function () {
      if (tracker.expired()) {
        goLobby();
        return;
      }
      var a = app && app();
      if (a && a.timerRunning && Date.now() - lastTouch >= TOUCH_EVERY_MS) {
        lastTouch = Date.now();
        post(win, '/api/training/lobby/claim', body);
      }
    }, 5000);

    win.addEventListener('pagehide', function () {
      release(true);
    });
    return true;
  }

  var api = {
    arenaFromPath: arenaFromPath,
    addButton: addButton,
    autoOpen: autoOpen,
    fromLobby: fromLobby,
    pickMatch: pickMatch,
    clientId: clientId,
    createIdleTracker: createIdleTracker,
    install: install,
    IDLE_MS: IDLE_MS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPRefereeLobby = api;
})(typeof window !== 'undefined' ? window : undefined);
