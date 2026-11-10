/**
 * BellePoule Modern - Écran d'arène : classe ArenaDisplay (socket, thème, annonces, mise à jour du match).
 * Extrait de arena.html (#1600) : lintable et testable ; la logique pure reste dans les modules arena*.js.
 * Script classique chargé en <script src="/js/arenaDisplay.js"> (CSP : pas de script inline).
 * Licensed under GPL-3.0
 */
/* global bpSocket, ArenaClient, ArenaUpdate, BPArenaOverlays, BPArenaRender, BPArenaPanels, escHtml */
const { setBannerLines, arenaIdFromPath, applyArenaTheme } = window.BPArenaUtils;
class ArenaDisplay {
  constructor() {
    this.socket = bpSocket();
    this.arenaId = this.getArenaId();
    this.arenaNumber = this.arenaNumberFromId();
    this.currentMatch = null;
    this.nextMatch = null;
    this.timerSeconds = 180;
    this.matchStatus = 'idle';
    this.cardsA = [];
    this.cardsB = [];
    this.isSuddenDeath = false;
    this.overtimeType = null;
    this.waitingOvertime = false;
    this.inversionEnabled = localStorage.getItem('inversionEnabled') === 'true';
    this.showPhotos = false;
    this.refereeFeatureEnabled = false;
    this.theme = localStorage.getItem('displayTheme') || 'dark';
    if (new URLSearchParams(window.location.search).get('cb') === '1')
      document.body.classList.add('colorblind');
    this.currentCustomTheme = null;

    this.init();
  }

  getArenaId() {
    return arenaIdFromPath(window.location.pathname);
  }

  arenaNumberFromId() {
    return this.arenaId.replace('arena', '');
  }

  init() {
    document.getElementById('arena-number').textContent = this.arenaNumber;
    document.getElementById('arena-idle-number').textContent = this.arenaNumber;
    document.getElementById('arena-strip-number').textContent = this.arenaNumber;
    this.setupInversionToggle();
    this.applyTheme(this.theme);
    this.setupHeaderAutoHide();
    this.setupSocketListeners();
    fetch('/api/session')
      .then(r => (r.ok ? r.json() : null))
      .then(s => {
        if (ArenaClient.isOlympicSession(s)) {
          document
            .querySelectorAll('.arena-word-label')
            .forEach(el => (el.textContent = window.T('remote.piste')));
          // Temps supplémentaire d'une minute en escrime olympique (#1027)
          const banner = document.getElementById('sudden-death-banner');
          if (banner) banner.textContent = window.T('arena.supplementary_1min');
        }
      })
      .catch(() => {});
  }

  applyTheme(theme, customTheme) {
    this.theme = applyArenaTheme(document, localStorage, theme, customTheme);
    this.currentCustomTheme = this.theme === 'custom' ? customTheme : this.currentCustomTheme;
  }

  setupHeaderAutoHide() {
    const header = document.querySelector('.header');
    let hideTimer = null;

    const showHeader = () => {
      header.classList.remove('hidden');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => header.classList.add('hidden'), 4000);
    };

    const trigger = document.createElement('div');
    trigger.className = 'header-trigger';
    document.body.appendChild(trigger);
    trigger.addEventListener('mouseenter', showHeader);

    document.addEventListener('mousemove', showHeader);

    hideTimer = setTimeout(() => header.classList.add('hidden'), 4000);
  }

  setupInversionToggle() {
    const checkbox = document.getElementById('inversion-checkbox');
    checkbox.checked = this.inversionEnabled;
    checkbox.addEventListener('change', () => {
      this.socket.emit('arena_control', { arenaId: this.arenaId, action: 'toggle_swap' });
    });
  }

  setupSocketListeners() {
    // Récupérer l'état actuel de l'arène au chargement (pour l'affichage initial)
    fetch(`/api/arenas/${this.arenaId}`)
      .then(res => res.json())
      .then(arena => {
        const initial = ArenaClient.initialArenaUpdate(arena);
        if (initial) this.handleArenaUpdate(initial);
      })
      .catch(err => console.error('[Arena] Erreur récupération état initial:', err));

    // Identifiant persistant de cet écran (survit aux rechargements/reconnexions)
    const _screenId = ArenaClient.getOrCreateScreenId(localStorage, Math.random, Date.now);

    this.socket.on('connect', () => {
      this.updateConnectionStatus(true);
      this.socket.emit('join_arena', { arenaId: this.arenaId, role: 'display' });
      this.socket.emit('client:register', {
        clientType: 'arena',
        arenaId: this.arenaId,
        userAgent: navigator.userAgent,
        screenId: _screenId,
      });
    });

    this.socket.on('server:command', cmd => {
      ArenaClient.dispatchServerCommand(cmd, {
        storage: localStorage,
        screenId: _screenId,
        actions: {
          reload: () => location.reload(),
          navigate: url => {
            location.href = url;
          },
          pong: () => this.socket.emit('client:pong'),
          identify: (label, ms) => this.showIdentifyOverlay(label, ms),
          message: (text, ms) => this.showRemoteMessage(text, ms),
        },
      });
    });

    setInterval(() => {
      if (this.socket.connected) this.socket.emit('client:pong');
    }, 30000);

    this.socket.on('disconnect', () => {
      this.updateConnectionStatus(false);
    });

    this.socket.on('connect_error', err => {
      this.updateConnectionStatus(false);
      const text = document.getElementById('connection-text');
      if (text) text.textContent = `❌ ${err?.message || 'Erreur réseau'}`;
    });

    this.socket.on(`arena:${this.arenaId}:update`, data => {
      this.handleArenaUpdate(data);
    });

    this.socket.on(`arena:${this.arenaId}:card_announcement`, ann => {
      this.showCardAnnouncement(ann);
    });

    this.socket.on(`arena:${this.arenaId}:exit_announcement`, ann => {
      this.showExitAnnouncement(ann);
    });

    this.socket.on(`arena:${this.arenaId}:coin_flip`, data => {
      if (!data.priority) this.showCoinFlipAnimation(data.winner, data.fencerA, data.fencerB);
      else window.BPPriorityDraw.fromEvent(this, data); // minute prioritaire (#1442)
    });

    this.socket.on('wallpaper:update', ({ wallpaper }) => {
      this.applyWallpaper(wallpaper);
    });

    fetch('/api/wallpaper')
      .then(res => res.json())
      .then(data => {
        if (data.wallpaper) this.applyWallpaper(data.wallpaper);
      })
      .catch(() => {});
  }

  showIdentifyOverlay(label, durationMs) {
    BPArenaOverlays.showIdentifyOverlay(
      { doc: document, T: window.T, esc: escHtml },
      label,
      durationMs
    );
  }

  showRemoteMessage(text, duration) {
    BPArenaOverlays.showRemoteMessage(document, text, duration);
  }

  applyWallpaper(wallpaper) {
    const ws = document.getElementById('waiting-screen');
    if (!ws) return;
    ws.style.backgroundImage = wallpaper ? `url(${wallpaper})` : '';
  }

  applyPriorityFrame(side) {
    this._prioSide = side; // côté logique, repeint si l'inversion change
    window.BPPriorityDraw.paintPriorityFrame(document, side, this.inversionEnabled);
  }

  showCoinFlipAnimation(winner, fencerA, fencerB) {
    this._prioFencerId = (winner === 'A' ? fencerA?.id : fencerB?.id) ?? null;
    this.applyPriorityFrame(winner);
    const overlay = document.getElementById('coin-flip-overlay');
    const coin = document.getElementById('coin-3d');
    const nameGreen = document.getElementById('coin-name-green');
    const nameRed = document.getElementById('coin-name-red');
    const result = document.getElementById('coin-result');
    if (!overlay || !coin || !nameGreen || !nameRed || !result) return;
    const plan = BPArenaOverlays.coinFlipPlan(winner, fencerA, fencerB);
    nameGreen.textContent = plan.nameGreen;
    nameRed.textContent = plan.nameRed;
    result.className = 'hidden';
    result.textContent = '';
    coin.style.transition = 'none';
    coin.style.transform = 'rotateY(0deg)';
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        coin.style.transition = 'transform 3.5s cubic-bezier(0.33, 1, 0.68, 1)';
        coin.style.transform = `rotateY(${plan.finalDeg}deg)`;
      });
    });
    setTimeout(() => {
      result.textContent = plan.resultText;
      result.className = plan.resultClass;
    }, 3600);
  }

  showExitAnnouncement(ann) {
    const banner = document.getElementById('card-announcement-banner');
    if (!banner) return;
    const { line1, line2, className } = BPArenaOverlays.exitAnnouncement(ann);
    setBannerLines(banner, line1, line2);
    banner.className = className;
    if (this._cardAnnouncementTimer) clearTimeout(this._cardAnnouncementTimer);
    this._cardAnnouncementTimer = setTimeout(() => {
      banner.className = 'card-announcement-banner';
    }, 5000);
  }

  showCardAnnouncement(ann) {
    const banner = document.getElementById('card-announcement-banner');
    if (!banner) return;
    const { line1, line2, className } = BPArenaOverlays.cardAnnouncement(ann);
    setBannerLines(banner, line1, line2);
    banner.className = className;
    if (this._cardAnnouncementTimer) clearTimeout(this._cardAnnouncementTimer);
    this._cardAnnouncementTimer = setTimeout(() => {
      banner.className = 'card-announcement-banner';
    }, 5000);
  }

  updateConnectionStatus(connected) {
    const dot = document.getElementById('connection-dot');
    const text = document.getElementById('connection-text');

    if (connected) {
      dot.classList.add('connected');
      text.textContent = window.T('remote.connected');
    } else {
      dot.classList.remove('connected');
      text.textContent = window.T('remote.disconnected');
    }
  }

  handleArenaUpdate(data) {
    // Plan pur (/js/arenaUpdate.js) : opérations ordonnées appliquées ici
    const ops = ArenaUpdate.planArenaUpdate(
      {
        _prioFencerId: this._prioFencerId,
        theme: this.theme,
        currentCustomTheme: this.currentCustomTheme,
        matchStatus: this.matchStatus,
        showPhotos: this.showPhotos,
        inversionEnabled: this.inversionEnabled,
      },
      data
    );
    for (const o of ops) {
      switch (o.op) {
        case 'set':
          this[o.key] = o.value;
          break;
        case 'applyPriorityFrame':
          this.applyPriorityFrame(o.side);
          break;
        case 'applyTheme':
          this.applyTheme(o.theme, o.customTheme);
          break;
        case 'syncInversion': {
          const cb = document.getElementById('inversion-checkbox');
          if (cb) cb.checked = o.value;
          localStorage.setItem('inversionEnabled', o.value);
          if (this._prioSide) this.applyPriorityFrame(this._prioSide); // #1442
          break;
        }
        case 'hideCoinFlip': {
          const overlay = document.getElementById('coin-flip-overlay');
          if (overlay) overlay.classList.add('hidden');
          break;
        }
        case 'score':
          document.getElementById(o.id).textContent = o.value;
          break;
        case 'updateTimerDisplay':
          this.updateTimerDisplay(o.timerStatus);
          break;
        default:
          this[o.op]();
      }
    }
  }

  updateStatusBadge() {
    BPArenaRender.updateStatusBadge(document, window.T, this.matchStatus);
  }

  updateMatchDisplay() {
    BPArenaRender.updateMatchDisplay(document, this.currentMatch, this.inversionEnabled);
  }

  applyInversionColors() {
    BPArenaRender.applyInversionColors(document, this.inversionEnabled);
    window.BPPriorityDraw.refreshFrame(this); // #1442
  }

  updateCardsDisplay() {
    BPArenaRender.updateCardsDisplay(
      document,
      escHtml,
      this.cardsA,
      this.cardsB,
      this.inversionEnabled
    );
  }

  updateTimerDisplay(timerStatus) {
    (this._timerView ||= BPArenaRender.smoothTimerView(document, window.BPTimer)).update(
      this.timerSeconds,
      timerStatus
    );
  }

  updateSuddenDeathBanner() {
    BPArenaRender.updateSuddenDeathBanner(document, this.isSuddenDeath, this.overtimeType);
  }

  updateWaitingOvertimeBanner() {
    const banner = document.getElementById('waiting-overtime-banner');
    if (banner) banner.classList.toggle('active', !!this.waitingOvertime);
  }

  updateVisibility() {
    const plan = BPArenaPanels.visibilityPlan(
      this.matchStatus,
      this.showPhotos,
      !!this.currentMatch,
      !!this.nextMatch
    );
    BPArenaPanels.applyVisibility(document, plan);
    if (plan.action === 'idle') {
      this.isSuddenDeath = false;
      this.overtimeType = null;
      this.waitingOvertime = false;
      this.updateWaitingOvertimeBanner();
      this.updateSuddenDeathBanner();
    }
    if (plan.action === 'intro') this.updatePhotoIntro();
    else if (plan.action === 'nextPanel') this.updateNextMatchPanel();
    else if (plan.action === 'idle' || plan.action === 'idleDisplay')
      this.updateIdleNextMatchDisplay();
  }

  updateNextMatchPanel() {
    BPArenaPanels.updateNextMatchPanel(
      document,
      this.nextMatch,
      this.inversionEnabled,
      this.refereeFeatureEnabled
    );
  }

  setNextFencerPhoto(side, photo) {
    BPArenaPanels.setPhoto(document, `next-photo-${side}`, `next-icon-${side}`, photo);
  }

  updatePhotoIntro() {
    BPArenaPanels.updatePhotoIntro(document, this.currentMatch, this.inversionEnabled);
  }

  setFencerPhoto(side, photo) {
    BPArenaPanels.setPhoto(document, `photo-${side}`, `default-icon-${side}`, photo);
  }

  updateIdleNextMatchDisplay() {
    BPArenaPanels.updateIdleNextMatchDisplay(document, this.nextMatch, this.inversionEnabled);
  }

  setIdleFencerPhoto(side, photo) {
    BPArenaPanels.setPhoto(document, `idle-photo-${side}`, `idle-icon-${side}`, photo);
  }
}

// Démarrer l'affichage (hors tests : module.exports défini)
if (typeof module === 'undefined')
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await window.initRemoteI18n();
      document.title = window.T('arena.title');
      new ArenaDisplay();
    } catch (e) {
      console.error('[ArenaDisplay] Erreur init:', e);
      const dot = document.getElementById('connection-dot');
      const text = document.getElementById('connection-text');
      if (dot) {
        dot.classList.add('disconnected');
        dot.classList.remove('connected');
      }
      if (text) text.textContent = '❌ Erreur: ' + (e?.message || e);
    }
  });

if (typeof module !== 'undefined' && module.exports) module.exports = { ArenaDisplay };
