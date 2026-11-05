/**
 * BellePoule Modern - Tablette arbitre en démo autonome (?demo=1), extraite de referee.html.
 * Miroir de l'arbitre virtuel du serveur : ouvre seule le match de la piste, suit scores et chrono,
 * anime l'appui sur le bouton de score, sans jamais envoyer d'action (arena_control filtré).
 * Script classique : window.BPDemoMirror.install(RefereeApp.prototype). Servi en /js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const CSS = `
    body.demo-mirror #active-match, body.demo-mirror #next-matches-screen { pointer-events: none; }
    .demo-mirror-banner { position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
      z-index: 3000; background: rgba(17, 24, 39, 0.85); color: #fff; padding: 6px 14px;
      border-radius: 999px; font-size: 0.85rem; }
    .score-btn.demo-tap { animation: demo-tap 0.35s ease-out; }
    @keyframes demo-tap {
      0% { transform: scale(1); filter: brightness(1); }
      40% { transform: scale(0.88); filter: brightness(1.6); box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.35); }
      100% { transform: scale(1); filter: brightness(1); }
    }`;

  const isDemo = () => new URLSearchParams(root.location.search).get('demo') === '1';
  const num = v => (typeof v === 'object' && v !== null ? (v.value ?? 0) : (v ?? 0));

  /** Active le miroir sur une instance : aucune action envoyée, bandeau « démo » */
  function setup(app) {
    app.demoMirror = isDemo();
    if (!app.demoMirror) return;
    const rawEmit = app.socket.emit.bind(app.socket);
    app.socket.emit = (event, ...args) =>
      event === 'arena_control' ? app.socket : rawEmit(event, ...args);
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    document.body.classList.add('demo-mirror');
    const banner = document.createElement('div');
    banner.className = 'demo-mirror-banner';
    banner.textContent = root.T ? root.T('referee.demo_banner') : 'Demo';
    document.body.appendChild(banner);
  }

  /** Anime l'appui sur le bouton de score du tireur (côté écran selon l'inversion) */
  function demoTap(app, fencer, points) {
    const side = (app.swapped ? fencer : fencer === 'A' ? 'B' : 'A').toLowerCase();
    const btn =
      document.getElementById(`btn-plus-${points}-${side}`) ||
      document.getElementById(`btn-plus-1-${side}`);
    if (!btn) return;
    btn.classList.remove('demo-tap');
    void btn.offsetWidth; // relance l'animation
    btn.classList.add('demo-tap');
  }

  /** Reflète l'arène pilotée par le serveur comme si un arbitre tenait la tablette */
  function mirrorUpdate(app, data) {
    if (data.trainingCustomRules !== undefined) app.trainingCustomRules = data.trainingCustomRules;
    const m = data.match;
    if (data.status === 'idle' || !m || !m.id) {
      if (app.currentMatch) {
        app.stopTimer();
        app._clearActiveMatch();
        document.getElementById('active-match').classList.remove('visible');
      }
      app.showNextMatchesScreen();
      return;
    }
    if (!app.currentMatch || app.currentMatch.id !== m.id) {
      app.stopTimer();
      const match = {
        id: m.id,
        poolId: m.poolId,
        fencerA: data.fencerA || m.fencerA,
        fencerB: data.fencerB || m.fencerB,
        scoreA: { value: 0 },
        scoreB: { value: 0 },
        status: 'not_started',
      };
      const idx = app.matches.findIndex(x => x.id === match.id);
      if (idx >= 0) app.matches[idx] = match;
      else app.matches.push(match);
      app.matchStatus = 'not_started';
      app.selectMatch(match.id);
    }
    const a = num(data.scoreA ?? m.scoreA);
    const b = num(data.scoreB ?? m.scoreB);
    if (data.status === 'in_progress' && app.matchStatus !== 'in_progress') {
      app.matchStatus = 'in_progress';
      app.startTimer();
      app.showNotification(root.T('referee.match_started'));
    }
    if (a > app.scoreA) demoTap(app, 'A', a - app.scoreA);
    if (b > app.scoreB) demoTap(app, 'B', b - app.scoreB);
    app.scoreA = a;
    app.scoreB = b;
    if (data.status === 'finished' && app.matchStatus !== 'finished') {
      app.stopTimer();
      app.matchStatus = 'finished';
      app.showNotification(root.T('referee.demo_match_finished'));
    }
    app.updateScores();
    app.updateMatchStatus();
    app.updateControlButtons();
  }

  function install(proto) {
    const wrap = (name, fn) => {
      const orig = proto[name];
      proto[name] = function (...args) {
        return fn.call(this, orig, args);
      };
    };
    wrap('init', function (orig, args) {
      setup(this);
      return orig.apply(this, args);
    });
    wrap('handleArenaUpdate', function (orig, args) {
      return this.demoMirror ? mirrorUpdate(this, args[0]) : orig.apply(this, args);
    });
    // Fin de match et signatures : gérées par l'arbitre virtuel
    for (const name of ['showFinishModal', 'openMatchSignature']) {
      wrap(name, function (orig, args) {
        return this.demoMirror ? undefined : orig.apply(this, args);
      });
    }
  }

  const api = { install, mirrorUpdate, isDemo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BPDemoMirror = api;
})(typeof window !== 'undefined' ? window : globalThis);
