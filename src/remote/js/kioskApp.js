/**
 * BellePoule Modern - Kiosque : application d'affichage (socket, rotation des vues, rendu).
 * Extrait de kiosk.html (#1600) : lintable et testable.
 * Script classique chargé en <script src="/js/kioskApp.js"> (CSP : pas de script inline).
 * Licensed under GPL-3.0
 */
/* global bpSocket, KioskArenas, KioskBracket, KioskBracketRender, KioskConfig, KioskData, KioskLists, KioskRender, KioskTiming, bpCssVar, escHtml */
// ─── État ────────────────────────────────────────────────────────────────
const ALL_VIEWS = ['poules', 'classement', 'final', 'direct', 'suivants', 'tableau'];

const state = {
  currentView: 'poules',
  views: ['poules', 'classement', 'final', 'direct', 'suivants', 'tableau'],
  rotationMs: 15000,
  rotationTimer: null,
  progressTimer: null,
  progressStart: null,
  menuTimer: null,
  session: null,
  poolsData: [],
  arenasData: [],
  upcomingData: [],
  overallRanking: [],
  trainingHistory: [],
  lastUpdate: null,
  prevArenaScores: {},
  bracketData: null,
  bracketPanTimer: null,
  bracketPanIndex: 0,
  bracketScaledCardW: 0,
  bracketScaledColGap: 0,
  bracketDisplayMode: 'auto', // 'auto' | 'compact' | 'focus'
};

// ─── Note d'organisation ─────────────────────────────────────────────────
let _orgNoteInterval = null;

function renderOrgNote(note) {
  clearInterval(_orgNoteInterval);
  _orgNoteInterval = null;
  const overlay = document.getElementById('org-note-overlay');
  if (!note) {
    overlay.classList.remove('visible');
    return;
  }

  document.getElementById('org-note-message').innerHTML = note.message
    ? '\u00ab\u00a0' + escHtml(note.message) + '\u00a0\u00bb'
    : '';

  if (note.type === 'target_time' && note.targetTime) {
    const { hh, mm, label: fmtTime } = KioskConfig.parseTargetTime(note.targetTime);
    document.getElementById('org-note-time').textContent = window.T('kiosk.resume_time', {
      prefix: note.countdownPrefix || window.T('kiosk.resume_at'),
      time: fmtTime,
    });

    const computeCountdown = () => {
      const diffSec = KioskConfig.secondsUntil(hh, mm, new Date());
      document.getElementById('org-note-countdown').textContent = KioskConfig.formatCountdown(
        window.T('kiosk.countdown_prefix'),
        diffSec
      );
      if (diffSec === 0) {
        clearInterval(_orgNoteInterval);
        overlay.classList.remove('visible');
      }
    };
    computeCountdown();
    _orgNoteInterval = setInterval(computeCountdown, 1000);
  } else {
    document.getElementById('org-note-time').textContent = '';
    document.getElementById('org-note-countdown').textContent = '';
  }

  overlay.classList.add('visible');
}

// ─── Rotation automatique ────────────────────────────────────────────────
function startRotation() {
  clearTimeout(state.rotationTimer);
  clearInterval(state.progressTimer);
  state.progressStart = Date.now();

  state.progressTimer = setInterval(() => {
    if (document.hidden) return;
    const elapsed = Date.now() - state.progressStart;
    const pct = KioskTiming.progressPct(elapsed, state.rotationMs);
    document.getElementById('progress-bar').style.width = pct + '%';
  }, 100);

  state.rotationTimer = setTimeout(() => {
    switchView(KioskTiming.nextView(state.views, state.currentView));
  }, state.rotationMs);
}

function switchView(name) {
  state.currentView = name;

  // Stopper le pan/focus du bracket si on quitte la vue tableau
  clearInterval(state.bracketPanTimer);
  state.bracketPanTimer = null;
  clearInterval(focusState.panTimer);
  clearInterval(focusState.progressTimer);
  cancelAnimationFrame(focusState.scrollAnim);
  clearTimeout(focusState.scrollDelay);
  clearTimeout(focusState.fadeTimer);
  focusState.panTimer = null;
  if (name !== 'tableau') stopCinemaMode();

  ALL_VIEWS.forEach(v => {
    document.getElementById('view-' + v).classList.toggle('active', v === name);
    const btn = document.getElementById('btn-' + v);
    if (btn) btn.classList.toggle('active', v === name);
  });

  stopAutoScroll();
  if (name === 'classement' || name === 'suivants') {
    const wrapper = document.getElementById(
      name === 'classement' ? 'ranking-scroll-wrapper' : 'suivants-container'
    );
    wrapper.scrollTop = 0;
    startAutoScroll(wrapper);
  }

  if (name === 'final') {
    renderFinalRanking();
  }

  if (name === 'tableau') {
    state.bracketPanIndex = 0;
    if (state.bracketData) {
      renderBracket();
      // En mode compact : scroll vers le round actif (ciné gère son propre pan-zoom)
      if (state.bracketDisplayMode !== 'cinema' && !isFocusMode(state.bracketData)) {
        setTimeout(() => {
          if (state.bracketData?.currentRound) scrollToBracketRound(state.bracketData.currentRound);
        }, 120);
        startBracketPan();
      }
    } else if (state.bracketDisplayMode !== 'cinema') {
      startBracketPan();
    }
  }

  document.getElementById('progress-bar').style.width = '0%';
  startRotation();
}

// ─── Auto-scroll classement ──────────────────────────────────────────────
const autoScroller = KioskTiming.createAutoScroller({
  raf: cb => requestAnimationFrame(cb),
  caf: id => cancelAnimationFrame(id),
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: id => clearTimeout(id),
});
const stopAutoScroll = () => autoScroller.stop();
const startAutoScroll = wrapper => autoScroller.start(wrapper);

// ─── Menu escamotable ────────────────────────────────────────────────────
function showMenu() {
  document.getElementById('kiosk-menu').classList.add('visible');
  clearTimeout(state.menuTimer);
  state.menuTimer = setTimeout(() => {
    document.getElementById('kiosk-menu').classList.remove('visible');
  }, 4000);
}

document.addEventListener('mousemove', showMenu);
document.addEventListener('keydown', e => {
  showMenu();
  if (e.key === 'ArrowRight') {
    const idx = state.views.indexOf(state.currentView);
    switchView(state.views[(idx + 1) % state.views.length]);
  }
  if (e.key === 'ArrowLeft') {
    const idx = state.views.indexOf(state.currentView);
    switchView(state.views[(idx - 1 + state.views.length) % state.views.length]);
  }
});

// ─── Configuration locale des vues ───────────────────────────────────────
const localConfig = KioskConfig.createLocalConfig({
  getItem: k => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
});
function saveLocalViews() {
  const v = {};
  ALL_VIEWS.forEach(n => {
    v[n] = document.getElementById('cb-' + n).checked;
  });
  localConfig.saveViews(v);
}
const loadLocalViews = () => localConfig.loadViews();

// ─── Configuration locale du délai de rotation ───────────────────────────
const saveLocalRotation = sec => localConfig.saveRotation(sec);
const loadLocalRotation = () => localConfig.loadRotation();

function applyLocalViews() {
  const enabled = ALL_VIEWS.filter(v => document.getElementById('cb-' + v).checked);
  state.views = enabled.length > 0 ? enabled : ALL_VIEWS.slice();
  ALL_VIEWS.forEach(v => {
    const btn = document.getElementById('btn-' + v);
    if (btn) btn.style.display = state.views.includes(v) ? '' : 'none';
  });
  if (!state.views.includes(state.currentView)) switchView(state.views[0]);
}

// Bouton ⚙ – toggle panneau
document.getElementById('btn-settings').addEventListener('click', e => {
  e.stopPropagation();
  const panel = document.getElementById('settings-panel');
  panel.classList.toggle('hidden');
  // Prolonger le timer menu tant que le panneau est ouvert
  if (!panel.classList.contains('hidden')) {
    clearTimeout(state.menuTimer);
  } else {
    showMenu(); // relance le timer d'auto-masquage
  }
});

// Fermer le panneau au clic à l'extérieur
document.addEventListener('click', e => {
  const panel = document.getElementById('settings-panel');
  const btn = document.getElementById('btn-settings');
  if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== btn) {
    panel.classList.add('hidden');
    showMenu();
  }
});

// Changement d'une checkbox
ALL_VIEWS.forEach(v => {
  document.getElementById('cb-' + v).addEventListener('change', () => {
    saveLocalViews();
    applyLocalViews();
    clearTimeout(state.menuTimer); // garder le menu visible pendant la config
  });
});

// Mode tableau DE
const saveLocalTableauMode = mode => localConfig.saveTableauMode(mode);
const loadLocalTableauMode = () => localConfig.loadTableauMode();
function applyTableauMode(mode) {
  state.bracketDisplayMode = mode;
  document.querySelectorAll('input[name="tableau-mode"]').forEach(r => {
    r.checked = r.value === mode;
  });
  // Re-render si la vue tableau est active
  if (state.currentView === 'tableau' && state.bracketData) renderBracket();
}
document.querySelectorAll('input[name="tableau-mode"]').forEach(r => {
  r.addEventListener('change', () => {
    const mode = document.querySelector('input[name="tableau-mode"]:checked')?.value || 'auto';
    saveLocalTableauMode(mode);
    applyTableauMode(mode);
    clearTimeout(state.menuTimer);
  });
});

// Changement du délai de rotation
document.getElementById('rotation-input').addEventListener('change', () => {
  const raw = parseInt(document.getElementById('rotation-input').value, 10);
  const sec = !isNaN(raw) && raw >= 3 ? Math.min(raw, 300) : 15;
  document.getElementById('rotation-input').value = sec;
  state.rotationMs = sec * 1000;
  saveLocalRotation(sec);
  startRotation();
  clearTimeout(state.menuTimer);
});

// ─── Statut connexion ────────────────────────────────────────────────────
function setStatus(ok, text) {
  const dot = document.getElementById('status-dot');
  dot.classList.toggle('ok', ok);
  document.getElementById('status-text').textContent = text;
}

// ─── Chargement des données ──────────────────────────────────────────────
async function fetchData() {
  try {
    const ok = await KioskData.loadKioskData(fetch, {
      onSession: session => {
        state.session = session;
        document.getElementById('menu-competition-name').textContent =
          session.competitionName || '';

        // Note d'organisation
        renderOrgNote(session.orgNote || null);

        // Vues kiosk : localStorage en priorité, sinon config serveur
        const checks = KioskData.resolveViewChecks(ALL_VIEWS, loadLocalViews(), session.kioskViews);
        if (checks) {
          ALL_VIEWS.forEach(v => {
            const cb = document.getElementById('cb-' + v);
            if (cb) cb.checked = checks[v];
          });
        }
        applyLocalViews();
      },
      onTraining: history => {
        state.trainingHistory = history;
        renderRanking();
      },
      onPools: (pools, overallRanking) => {
        state.poolsData = pools;
        if (overallRanking) state.overallRanking = overallRanking;
        else buildOverallRanking();
        renderPools();
        renderRanking();
      },
      onArenas: arenas => {
        state.arenasData = arenas;
        renderArenas();
      },
      onUpcoming: upcoming => {
        state.upcomingData = upcoming;
        renderSuivants();
      },
    });
    if (!ok) {
      setStatus(false, tk('kiosk.no_session'));
      return;
    }

    state.lastUpdate = new Date();
    setStatus(true, tk('kiosk.updated') + ' ' + state.lastUpdate.toLocaleTimeString('fr-FR'));
    retryAttempt = 0;
  } catch (err) {
    setStatus(false, tk('remote.error_connection'));
    scheduleRetry();
  }
}

// Reprise après échec : backoff exponentiel + jitter (1 s → 30 s), jamais de polling régulier
let retryAttempt = 0;
let retryTimer = null;
function scheduleRetry() {
  clearTimeout(retryTimer);
  const delay = KioskTiming.retryDelay(retryAttempt, Math.random());
  retryAttempt = Math.min(retryAttempt + 1, 5);
  retryTimer = setTimeout(resyncAll, delay);
}

// Rechargement complet (connexion / reconnexion, retour de visibilité, réseau revenu)
function resyncAll() {
  fetchData();
  fetchLogo();
  fetchBracket();
  if (window.kioskRefreshEta) window.kioskRefreshEta();
}

// Événement « données modifiées » du serveur : regroupé pour éviter les rafales
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(resyncAll, 200 + Math.random() * 300);
}

// ─── Classement général (agrégation des poules) ──────────────────────────
function buildOverallRanking() {
  state.overallRanking = KioskBracket.buildOverallRanking(state.poolsData);
}

// ─── Rendu Poules ────────────────────────────────────────────────────────
function renderPools() {
  const pools = state.poolsData;
  document.getElementById('poules-badge').textContent = tk('kiosk.count_pools', {
    count: pools.length,
  });
  document.getElementById('pools-container').innerHTML = KioskRender.poolsHtml(pools, tk, escHtml);
}

// ─── Rendu Classement ────────────────────────────────────────────────────
function renderRanking() {
  const tbody = document.getElementById('ranking-body');

  // Mode entraînement : afficher l'historique des combats
  if (state.session?.competitionId === '__training__') {
    const hist = (state.trainingHistory || []).slice().reverse();
    document.getElementById('classement-badge').textContent = tk('kiosk.count_bouts', {
      count: hist.length,
    });
    tbody.innerHTML = KioskRender.trainingRowsHtml(hist, tk, escHtml, iso =>
      new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    );
    return;
  }

  const ranking = state.overallRanking;
  document.getElementById('classement-badge').textContent = tk('kiosk.count_fencers', {
    count: ranking.length,
  });
  tbody.innerHTML = KioskRender.rankingRowsHtml(ranking, tk, escHtml);
}

// ─── Rendu Classement Final ──────────────────────────────────────────────
// Ordre du classement général des poules (meilleur classé d'abord)
const sortBySeed = fencers => KioskBracket.sortBySeed(fencers, state.overallRanking);

function renderFinalRanking() {
  const el = document.getElementById('final-ranking-body');
  if (!el) return;
  const { ranked } = KioskLists.computeFinalRanking(state.bracketData, sortBySeed);
  if (!ranked) {
    el.innerHTML = KioskLists.notDoneHtml(tk, escHtml);
    document.getElementById('final-badge').textContent = '—';
    return;
  }
  document.getElementById('final-badge').textContent = tk('kiosk.count_fencers', {
    count: ranked.length,
  });
  el.innerHTML = KioskLists.finalTableHtml(ranked, tk, escHtml);
}

// ─── Rendu Matchs suivants ───────────────────────────────────────────────
function renderSuivants() {
  const matches = state.upcomingData;
  const pending = matches.filter(m => m.status !== 'finished');
  document.getElementById('suivants-badge').textContent = tk('kiosk.count_matches', {
    count: pending.length,
  });
  document.getElementById('suivants-container').innerHTML = KioskLists.suivantsHtml(
    matches,
    tk,
    escHtml
  );
}

// ─── Rendu Arènes ────────────────────────────────────────────────────────
function renderArenas() {
  const container = document.getElementById('arenas-container');
  const arenas = state.arenasData;

  const activeCount = arenas.filter(a => a.status === 'in_progress').length;
  document.getElementById('direct-badge').textContent = tk('kiosk.count_active_strips', {
    count: activeCount,
  });

  if (!arenas || arenas.length === 0) {
    container.innerHTML =
      '<div class="no-data"><div class="no-data-icon">⏱️</div><h3>' +
      escHtml(tk('kiosk.no_strips')) +
      '</h3></div>';
    return;
  }

  // ── Détecter les changements de score avant de reconstruire le DOM ───
  const { changed: changedScores, slash: slashScores } = KioskArenas.detectScoreChanges(
    arenas,
    state.prevArenaScores
  );

  container.innerHTML = KioskArenas.renderArenasHtml(arenas, {
    tk,
    escHtml,
    arenaLabel: window.getArenaLabel(),
  });

  // ── Appliquer les animations après reconstruction du DOM ─────────────
  for (const elemId of changedScores) {
    const el = document.getElementById(elemId);
    if (!el) continue;
    el.classList.remove('score-updated', 'score-slash');
    void el.offsetWidth; // force reflow pour relancer l'animation
    el.classList.add('score-updated');
    if (slashScores.includes(elemId)) el.classList.add('score-slash');
    el.addEventListener(
      'animationend',
      () => {
        el.classList.remove('score-updated', 'score-slash');
      },
      { once: true }
    );
  }

  // ── Persister les scores courants pour la prochaine comparaison ───────
  Object.assign(state.prevArenaScores, KioskArenas.snapshotScores(arenas));
}

// ─── Focus-round mode (grands tableaux T32+) ────────────────────────

const focusState = {
  rounds: [],
  currentIdx: 0,
  panTimer: null,
  progressTimer: null,
  progressStart: null,
  durationMs: 7000,
  scrollAnim: null,
};

// État du mode ciné (pan-zoom auto)
const cinemaState = {
  layout: null,
  step: 0, // 0 = vue d'ensemble, 1..N = rounds
  timer: null,
  overviewMs: 4500,
  roundMs: 6500,
  scanFrac: 0.55, // part du temps consacrée au défilement vertical d'un round
};

const isFocusMode = data => KioskBracket.isFocusMode(data, state.bracketDisplayMode);

function startFocusMode(data) {
  document.getElementById('bracket-outer').style.display = 'none';
  const focusOuter = document.getElementById('bracket-focus-outer');
  focusOuter.classList.add('active');

  // Uniquement les phases en cours : au moins un match à deux opposants non joué (#1036)
  const allRounds = getBracketRoundOrder(data.rounds);
  const ongoing = allRounds.filter(r =>
    r.matches.some(m => !m.isBye && m.fencerA && m.fencerB && m.status !== 'finished')
  );
  focusState.rounds = ongoing.length > 0 ? ongoing : allRounds;
  // Démarrer sur le round courant si possible
  const curIdx = focusState.rounds.findIndex(r => r.round === data.currentRound);
  focusState.currentIdx = curIdx >= 0 ? curIdx : 0;

  renderFocusDots();
  renderFocusRound();
  startFocusPan();
}

// Rafraîchit les données du mode focus sans toucher au timer (trait jaune).
// Retourne false si la liste des phases a changé (redémarrage complet nécessaire).
function refreshFocusMode(data) {
  const allRounds = getBracketRoundOrder(data.rounds);
  const ongoing = allRounds.filter(r =>
    r.matches.some(m => !m.isBye && m.fencerA && m.fencerB && m.status !== 'finished')
  );
  const rounds = ongoing.length > 0 ? ongoing : allRounds;
  const same =
    rounds.length === focusState.rounds.length &&
    rounds.every((r, i) => r.round === focusState.rounds[i].round);
  if (!same) return false;
  const prev = JSON.stringify(focusState.rounds[focusState.currentIdx]);
  focusState.rounds = rounds;
  if (JSON.stringify(rounds[focusState.currentIdx]) !== prev) {
    renderFocusRound();
  }
  return true;
}

function stopFocusMode() {
  clearInterval(focusState.panTimer);
  clearInterval(focusState.progressTimer);
  cancelAnimationFrame(focusState.scrollAnim);
  clearTimeout(focusState.scrollDelay);
  clearTimeout(focusState.fadeTimer);
  document.getElementById('bracket-focus-scroll')?.classList.remove('focus-fade');
  focusState.panTimer = null;
  focusState.progressTimer = null;
  document.getElementById('bracket-outer').style.display = '';
  const focusOuter = document.getElementById('bracket-focus-outer');
  focusOuter.classList.remove('active');
}

// ─── Mode ciné : pan-zoom automatique sur le tableau complet ───────────

const buildCinemaFrames = (L, vw, vh) => KioskBracket.buildCinemaFrames(L, vw, vh, cinemaState);

function applyCinemaFrame(f) {
  const inner = document.getElementById('bracket-inner');
  if (!inner) return;
  inner.style.setProperty('--cinema-dur', f.transMs + 'ms');
  inner.style.transform = `translate(${f.tx}px, ${f.ty}px) scale(${f.scale})`;
  updateCinemaMinimap(f);
}

function startCinemaMode() {
  const L = cinemaState.layout;
  const outer = document.getElementById('bracket-outer');
  if (!L || !outer) return;
  const vw = outer.clientWidth || window.innerWidth;
  const vh = outer.clientHeight || window.innerHeight - 200;

  drawCinemaMinimap(L, vw, vh);
  const frames = buildCinemaFrames(L, vw, vh);
  cinemaState.frames = frames;
  cinemaState.step = 0;

  clearTimeout(cinemaState.timer);
  const run = () => {
    const f = cinemaState.frames[cinemaState.step];
    applyCinemaFrame(f);
    cinemaState.timer = setTimeout(() => {
      cinemaState.step = (cinemaState.step + 1) % cinemaState.frames.length;
      run();
    }, f.transMs + f.holdMs);
  };
  run();
}

function stopCinemaMode() {
  clearTimeout(cinemaState.timer);
  cinemaState.timer = null;
  const inner = document.getElementById('bracket-inner');
  if (inner) inner.style.transform = '';
  const outer = document.getElementById('bracket-outer');
  if (outer) outer.classList.remove('cinema');
}

// Minimap : dessine un schéma du tableau (lanes par round)
function drawCinemaMinimap(L, vw, vh) {
  const canvas = document.getElementById('cinema-minimap-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width,
    H = canvas.height;
  const mm = Math.min(W / L.totalW, H / L.innerH);
  cinemaState.mm = {
    mm,
    ox: (W - L.totalW * mm) / 2,
    oy: (H - L.innerH * mm) / 2,
    vw,
    vh,
    W,
    H,
  };
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(148,163,184,0.5)';
  const { ox, oy } = cinemaState.mm;
  for (let i = 0; i < L.colX.length; i++) {
    const rd = L.orderedRounds[i];
    const x = ox + L.colX[i] * mm;
    const w = Math.max(2, L.cardW * mm);
    for (const m of rd.matches) {
      if (m.isBye) continue;
      const yc = oy + (L.matchTop + L.yCenter(m.position || 1, rd.round)) * mm;
      const h = Math.max(1.5, L.cardH * mm);
      ctx.fillStyle =
        m.status === 'live'
          ? bpCssVar('--green-500')
          : m.status === 'finished'
            ? 'rgba(148,163,184,0.7)'
            : 'rgba(148,163,184,0.35)';
      ctx.fillRect(x, yc - h / 2, w, h);
    }
  }
}

function updateCinemaMinimap(f) {
  const vp = document.getElementById('cinema-minimap-viewport');
  const mmd = cinemaState.mm;
  if (!vp || !mmd) return;
  // Région de contenu visible (coords contenu) -> coords minimap
  const visX = -f.tx / f.scale;
  const visY = -f.ty / f.scale;
  const visW = mmd.vw / f.scale;
  const visH = mmd.vh / f.scale;
  vp.style.setProperty('--cinema-dur', f.transMs + 'ms');
  vp.style.left = mmd.ox + visX * mmd.mm + 'px';
  vp.style.top = mmd.oy + visY * mmd.mm + 'px';
  vp.style.width = visW * mmd.mm + 'px';
  vp.style.height = visH * mmd.mm + 'px';
}

function renderFocusDots() {
  const dotsEl = document.getElementById('focus-round-dots');
  dotsEl.innerHTML = focusState.rounds
    .map((r, i) => `<div class="focus-dot${i === focusState.currentIdx ? ' active' : ''}"></div>`)
    .join('');
}

function renderFocusRound() {
  const rd = focusState.rounds[focusState.currentIdx];
  if (!rd) return;

  document.getElementById('focus-round-label').textContent = rd.label || 'Round ' + rd.round;

  // Update dots
  const dots = document.querySelectorAll('#focus-round-dots .focus-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === focusState.currentIdx));

  const scroll = document.getElementById('bracket-focus-scroll');
  const matches = rd.matches.filter(m => !m.isBye);

  scroll.innerHTML = matches
    .map((match, idx) => {
      const fA = match.fencerA;
      const fB = match.fencerB;
      const nameA = fA
        ? escHtml(fA.lastName + (fA.firstName ? ' ' + fA.firstName[0] + '.' : ''))
        : '?';
      const nameB = fB
        ? escHtml(fB.lastName + (fB.firstName ? ' ' + fB.firstName[0] + '.' : ''))
        : 'TBD';
      const clubA = fA?.club ? `<span class="focus-fencer-club">${escHtml(fA.club)}</span>` : '';
      const clubB = fB?.club ? `<span class="focus-fencer-club">${escHtml(fB.club)}</span>` : '';
      const winA = match.winnerId && fA && match.winnerId === fA.id;
      const winB = match.winnerId && fB && match.winnerId === fB.id;
      const sA = match.scoreA !== null && match.scoreA !== undefined ? match.scoreA : '';
      const sB = match.scoreB !== null && match.scoreB !== undefined ? match.scoreB : '';
      const cls =
        match.status === 'live'
          ? 'match--live'
          : match.status === 'finished'
            ? 'match--finished'
            : '';
      const arenaHtml = match.arenaName
        ? `<div class="focus-match-arena">${escHtml(match.arenaName)}</div>`
        : '';

      return `<div class="focus-match-card ${cls}">
      <div class="focus-match-num">${escHtml(match.position || idx + 1)}</div>
      <div class="focus-match-fencers">
        <div class="focus-fencer-row ${winA ? 'fm-winner' : winB ? 'fm-loser' : ''}">
          <span class="focus-fencer-name">${/* html */ nameA}${/* html */ clubA}</span>
          <span class="focus-fencer-score">${escHtml(sA)}</span>
        </div>
        <div class="focus-fencer-row ${winB ? 'fm-winner' : winA ? 'fm-loser' : ''}">
          <span class="focus-fencer-name">${/* html */ nameB}${/* html */ clubB}</span>
          <span class="focus-fencer-score">${escHtml(sB)}</span>
        </div>
      </div>
      ${arenaHtml}
    </div>`;
    })
    .join('');

  // Auto-scroll vertical si le contenu dépasse
  scroll.scrollTop = 0;
  startFocusScroll(scroll);
}

// Défilement progressif vers le bas sur toute la durée d'affichage du round (#1036) :
// courte pause en haut, descente linéaire, courte pause en bas avant la transition.
const FOCUS_HOLD_MS = 1000;
function startFocusScroll(wrapper) {
  cancelAnimationFrame(focusState.scrollAnim);
  clearTimeout(focusState.scrollDelay);
  const duration = Math.max(1000, focusState.durationMs - 2 * FOCUS_HOLD_MS - 600);
  let startTime = null;

  function step(now) {
    if (startTime === null) startTime = now;
    const maxScroll = wrapper.scrollHeight - wrapper.clientHeight;
    if (maxScroll <= 0) return;
    const progress = Math.min(1, (now - startTime) / duration);
    wrapper.scrollTop = progress * maxScroll;
    if (progress < 1) {
      focusState.scrollAnim = requestAnimationFrame(step);
    }
  }

  focusState.scrollDelay = setTimeout(() => {
    focusState.scrollAnim = requestAnimationFrame(step);
  }, FOCUS_HOLD_MS);
}

// Fondu sortant → round suivant → fondu entrant
function transitionFocusRound(nextIdx) {
  const scroll = document.getElementById('bracket-focus-scroll');
  cancelAnimationFrame(focusState.scrollAnim);
  clearTimeout(focusState.scrollDelay);
  scroll.classList.add('focus-fade');
  clearTimeout(focusState.fadeTimer);
  focusState.fadeTimer = setTimeout(() => {
    focusState.currentIdx = nextIdx;
    renderFocusRound();
    scroll.classList.remove('focus-fade');
  }, 600);
}

function startFocusPan() {
  clearInterval(focusState.panTimer);
  clearInterval(focusState.progressTimer);

  focusState.progressStart = Date.now();
  document.getElementById('focus-round-progress-bar').style.width = '0%';

  focusState.progressTimer = setInterval(() => {
    if (document.hidden) return;
    const elapsed = Date.now() - focusState.progressStart;
    const pct = Math.min(100, (elapsed / focusState.durationMs) * 100);
    document.getElementById('focus-round-progress-bar').style.width = pct + '%';
  }, 100);

  focusState.panTimer = setInterval(() => {
    document.getElementById('focus-round-progress-bar').style.width = '0%';
    focusState.progressStart = Date.now();
    transitionFocusRound((focusState.currentIdx + 1) % focusState.rounds.length);
  }, focusState.durationMs);
}

// ─── Bracket d'élimination directe ──────────────────────────────────────

const getBracketDims = KioskBracket.getBracketDims;

async function fetchBracket() {
  try {
    const res = await fetch('/api/bracket');
    if (!res.ok) return;
    const data = await res.json();
    state.bracketData = data;
    if (state.currentView === 'tableau') renderBracket();
    else if (state.currentView === 'final') renderFinalRanking();
  } catch {
    /* optionnel */
  }
}

function startBracketPan() {
  clearInterval(state.bracketPanTimer);
  if (!state.bracketData?.rounds?.length) return;
  state.bracketPanTimer = setInterval(() => {
    if (document.hidden || !state.bracketData?.rounds?.length) return;
    state.bracketPanIndex = (state.bracketPanIndex + 1) % state.bracketData.rounds.length;
    const r = state.bracketData.rounds[state.bracketPanIndex];
    if (r) scrollToBracketRound(r.round);
  }, 8000);
}

function scrollToBracketRound(roundValue) {
  const outer = document.getElementById('bracket-outer');
  if (!outer || !state.bracketData?.rounds) return;
  const sCardW = state.bracketScaledCardW || getBracketDims(state.bracketData).cardW;
  const sColGap = state.bracketScaledColGap || getBracketDims(state.bracketData).colGap;
  const orderedRounds = getBracketRoundOrder(state.bracketData.rounds);
  const idx = orderedRounds.findIndex(r => r.round === roundValue);
  if (idx < 0) return;
  const colX = idx * (sCardW + sColGap) + sColGap / 2;
  const viewW = outer.clientWidth;
  const targetLeft = Math.max(0, colX - viewW / 2 + sCardW / 2);
  outer.scrollTo({ left: targetLeft, behavior: 'smooth' });
}

const getBracketRoundOrder = KioskBracket.getBracketRoundOrder;

function renderBracket() {
  const container = document.getElementById('bracket-inner');
  if (!container) return;

  const data = state.bracketData;
  if (!data || !data.rounds || data.rounds.length === 0) {
    document.getElementById('tableau-badge').textContent = '—';
    stopFocusMode();
    container.innerHTML =
      '<div class="no-data"><div class="no-data-icon">🏆</div><h3>' +
      escHtml(tk('kiosk.no_bracket')) +
      '</h3><p>' +
      escHtml(tk('kiosk.no_bracket_hint')) +
      '</p></div>';
    return;
  }

  // Badge & subtitle communs
  document.getElementById('tableau-badge').textContent = KioskBracketRender.bracketBadge(data);
  const orderedForLabel = getBracketRoundOrder(data.rounds);
  document.getElementById('tableau-subtitle').textContent = data.currentRound
    ? orderedForLabel.find(r => r.round === data.currentRound)?.label ||
      tk('arena.status_in_progress')
    : tk('kiosk.phase_finished');

  // Basculer en mode focus pour les grands tableaux
  if (isFocusMode(data)) {
    // Cycle déjà en cours : ne pas le réinitialiser à chaque rafraîchissement des données (#1036)
    if (focusState.panTimer !== null && refreshFocusMode(data)) {
      renderFinalRanking();
      return;
    }
    stopFocusMode();
    startFocusMode(data);
    renderFinalRanking();
    return;
  }

  // Sinon mode compact classique (ou ciné)
  stopFocusMode();
  const cinema = state.bracketDisplayMode === 'cinema';

  const orderedRounds = getBracketRoundOrder(data.rounds);
  if (orderedRounds.length === 0) {
    container.innerHTML =
      '<div class="no-data"><div class="no-data-icon">🏆</div><h3>' +
      escHtml(tk('kiosk.no_match')) +
      '</h3></div>';
    return;
  }

  // En mode ciné : pas de réduction, on garde la taille naturelle (le zoom gère).
  const availH = cinema ? Infinity : Math.max(200, (window.innerHeight || 800) - 220);
  const { html, layout } = KioskBracketRender.buildCompactBracket(
    data,
    orderedRounds,
    getBracketDims(data),
    availH,
    escHtml
  );
  state.bracketScaledCardW = layout.cardW;
  state.bracketScaledColGap = layout.colGap;

  renderFinalRanking();
  container.style.width = layout.totalW + 'px';
  container.style.minWidth = '';
  container.innerHTML = html;

  // Mode ciné : mémoriser la géométrie et lancer le pan-zoom auto.
  const outer = document.getElementById('bracket-outer');
  if (cinema) {
    cinemaState.layout = layout;
    outer.classList.add('cinema');
    startCinemaMode();
  } else {
    outer.classList.remove('cinema');
    stopCinemaMode();
  }
}

// ─── Logo organisateur ───────────────────────────────────────────────────
function applyLogo(logo) {
  const el = document.getElementById('org-logo');
  if (!el) return;
  if (logo) {
    el.src = logo;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
    el.src = '';
  }
}

async function fetchLogo() {
  try {
    const res = await fetch('/api/logo');
    if (res.ok) {
      const { logo } = await res.json();
      applyLogo(logo || null);
    }
  } catch {
    /* logo optionnel */
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────
// Traduction (src/remote/i18n.js) ; repli sur la clé si i18n.js absent
function tk(key, params) {
  return window.T ? window.T(key, params) : key;
}

// ─── Init ─────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await window.initRemoteI18n();

  const savedSec = loadLocalRotation();
  state.rotationMs = savedSec * 1000;
  document.getElementById('rotation-input').value = savedSec;

  applyTableauMode(loadLocalTableauMode());

  // Plus de polling (#1152) : chargement initial, puis événements Socket.IO
  // (kiosk:data, bracket:update, logo:update) et resynchronisation à la (re)connexion.
  resyncAll();
  startRotation();

  // Identifiant persistant de cet écran (survit aux rechargements)
  let _screenId = localStorage.getItem('bp_screen_id');
  if (!_screenId) {
    _screenId = 'scr_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('bp_screen_id', _screenId);
  }

  function _showIdentifyOverlay(label, durationMs) {
    let ov = document.getElementById('bp-identify-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'bp-identify-overlay';
      ov.style.cssText = [
        'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;',
        'align-items:center;justify-content:center;pointer-events:none;',
        'animation:bp-identify-blink 0.5s ease-in-out infinite alternate;',
      ].join('');
      const style = document.createElement('style');
      style.textContent =
        '@keyframes bp-identify-blink{from{background:rgba(59,130,246,0.55)}to{background:rgba(139,92,246,0.65)}}';
      document.head.appendChild(style);
      document.body.appendChild(ov);
    }
    ov.innerHTML =
      '<div style="background:rgba(0,0,0,0.85);border:3px solid var(--blue-500);border-radius:1.5rem;padding:2rem 4rem;text-align:center;max-width:80vw;">' +
      '<div style="font-size:2.5rem;font-weight:900;color:var(--color-white);margin-bottom:0.5rem;">📺 ' +
      escHtml(label) +
      '</div>' +
      '<div style="font-size:1rem;color:var(--slate-400);">' +
      escHtml(tk('kiosk.identify')) +
      '</div>' +
      '</div>';
    ov.style.display = 'flex';
    clearTimeout(ov._t);
    ov._t = setTimeout(() => {
      ov.style.display = 'none';
    }, durationMs ?? 5000);
  }

  // Socket.IO : mise à jour temps réel du bracket
  try {
    const socket = bpSocket();
    socket.on('bracket:update', fetchBracket);
    socket.on('kiosk:data', scheduleRefresh);
    socket.on('logo:update', d => applyLogo((d && d.logo) || null));
    let _connectedOnce = false;
    socket.on('connect', () => {
      socket.emit('client:register', {
        clientType: 'kiosk',
        userAgent: navigator.userAgent,
        screenId: _screenId,
      });
      // Reconnexion (coupure Wi-Fi, redémarrage serveur) : on a pu rater des événements
      if (_connectedOnce) resyncAll();
      _connectedOnce = true;
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) resyncAll();
    });
    window.addEventListener('online', resyncAll);
    socket.on('server:command', cmd => {
      if (cmd.type === 'refresh') {
        location.reload();
        return;
      }
      if (cmd.type === 'navigate' && cmd.url) {
        location.href = cmd.url;
        return;
      }
      if (cmd.type === 'ping') {
        socket.emit('client:pong');
        return;
      }
      if (cmd.type === 'identify') {
        const lbl = cmd.screenLabel || localStorage.getItem('bp_screen_label') || _screenId;
        if (cmd.screenLabel) localStorage.setItem('bp_screen_label', cmd.screenLabel);
        _showIdentifyOverlay(lbl, cmd.duration ?? 5000);
        return;
      }
      if (cmd.type === 'kiosk:theme' && cmd.variables) {
        const root = document.documentElement;
        const preset = cmd.variables['--k-preset'];
        if (preset !== undefined) {
          // Thème prédéfini (néon / clair / défaut) : remplace les variables personnalisées
          Array.from(root.style)
            .filter(p => p.startsWith('--k-'))
            .forEach(p => root.style.removeProperty(p));
          if (preset === 'neon' || preset === 'light') root.setAttribute('data-k-theme', preset);
          else root.removeAttribute('data-k-theme');
        }
        Object.entries(cmd.variables).forEach(([k, v]) => {
          if (k !== '--k-preset') root.style.setProperty(k, String(v));
        });
        return;
      }
      if (cmd.type === 'kiosk:config' && cmd.kioskConfig) {
        const cfg = cmd.kioskConfig;
        if (cfg.rotationSec != null)
          localStorage.setItem('kioskRotationSec', String(Math.max(3, cfg.rotationSec)));
        const viewKeys = ['poules', 'classement', 'final', 'direct', 'suivants', 'tableau'];
        const cur = JSON.parse(localStorage.getItem('kioskViewsLocal') || '{}');
        viewKeys.forEach(k => {
          if (k in cfg) cur[k] = cfg[k];
        });
        if ('eta' in cfg) localStorage.setItem('kioskShowEta', cfg.eta === false ? '0' : '1');
        localStorage.setItem('kioskViewsLocal', JSON.stringify(cur));
        // Recharger pour appliquer la nouvelle config
        location.reload();
        return;
      }
      if (cmd.type === 'message' && cmd.text) {
        let b = document.getElementById('remote-msg-banner');
        if (!b) {
          b = document.createElement('div');
          b.id = 'remote-msg-banner';
          b.style.cssText =
            'position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,0.82);color:var(--color-white);font-size:1.3rem;padding:0.7rem 1.2rem;text-align:center;z-index:9999;pointer-events:none;transition:opacity 0.4s;';
          document.body.appendChild(b);
        }
        b.textContent = cmd.text;
        b.style.opacity = '1';
        clearTimeout(b._t);
        b._t = setTimeout(() => {
          b.style.opacity = '0';
        }, cmd.duration ?? 5000);
      }
    });
    setInterval(() => {
      if (socket.connected) socket.emit('client:pong');
    }, 30000);
  } catch {
    /* Socket.IO optionnel */
  }

  // Plein écran automatique au premier clic seulement
  let _fsRequested = false;
  document.addEventListener(
    'click',
    () => {
      if (!_fsRequested && !document.fullscreenElement) {
        _fsRequested = true;
        document.documentElement.requestFullscreen().catch(() => {});
      }
    },
    { capture: true }
  );
});
