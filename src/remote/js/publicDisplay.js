/**
 * BellePoule Modern - Page publique : classe PublicDisplay (socket, affichage du match, annonces).
 * Extrait de public.html (#1600) : lintable et testable.
 * Script classique chargé en <script src="/js/publicDisplay.js"> (CSP : pas de script inline).
 * Licensed under GPL-3.0
 */
/* global bpIcon, bpSocket, escHtml */
const { setBannerLines } = window.BPArenaUtils;
const applyScreenTheme = variables => window.BPArenaUtils.applyScreenTheme(document, variables);

class PublicDisplay {
  constructor() {
    if (new URLSearchParams(window.location.search).get('cb') === '1')
      document.body.classList.add('colorblind');
    this.socket = bpSocket();
    this.arenaId = this.getArenaId();
    this.arenaNumber = this.arenaNumberFromId();
    this.currentMatch = null;
    this.timerSeconds = 180;
    this.matchStatus = 'idle';
    this.cardsA = [];
    this.cardsB = [];
    this.isSuddenDeath = false;
    this.overtimeType = null;
    this.refereeSelected = false;
    // Clé localStorage indépendante des autres écrans
    this.inversionEnabled = localStorage.getItem('publicInversionEnabled') === 'true';
    this.showPhotos = false;

    this.init();
  }

  getArenaId() {
    const path = window.location.pathname;
    const match = path.match(/arene(\d+)/i) || path.match(/arena(\d+)/i);
    return match ? `arena${match[1]}` : 'arena1';
  }

  arenaNumberFromId() {
    return this.arenaId.replace('arena', '');
  }

  init() {
    document.getElementById('arena-number').textContent = this.arenaNumber;
    document.getElementById('arena-idle-number').textContent = this.arenaNumber;
    this.setupInversionToggle();
    this.setupSocketListeners();
    fetch('/api/session')
      .then(r => (r.ok ? r.json() : null))
      .then(s => {
        if (s && (['E', 'F', 'S'].includes(s.weapon) || s.modernRules === true)) {
          const pisteLabel = window.T('remote.piste');
          document.getElementById('arena-word-label').textContent = pisteLabel;
          const idleLabel = document.querySelector('.arena-idle-label');
          if (idleLabel) idleLabel.textContent = pisteLabel;
          // Temps supplémentaire d'une minute en escrime olympique (#1442)
          const sdBanner = document.getElementById('sudden-death-banner');
          if (sdBanner) {
            sdBanner.setAttribute('data-i18n', 'arena.supplementary_1min');
            sdBanner.textContent = window.T('arena.supplementary_1min');
          }
        }
      })
      .catch(() => {});
  }

  setupInversionToggle() {
    const checkbox = document.getElementById('inversion-checkbox');
    checkbox.checked = this.inversionEnabled;
    checkbox.addEventListener('change', () => {
      this.inversionEnabled = checkbox.checked;
      localStorage.setItem('publicInversionEnabled', this.inversionEnabled);
      this.applyInversionColors();
      if (this._prioSide) this.applyPriorityFrame(this._prioSide); // #1442
      if (this.currentMatch) this.updateMatchDisplay();
      this.updateCardsDisplay();
    });
  }

  showIdentifyOverlay(label, durationMs) {
    let ov = document.getElementById('bp-identify-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'bp-identify-overlay';
      ov.style.cssText =
        'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;pointer-events:none;animation:bp-identify-blink 0.5s ease-in-out infinite alternate;';
      const style = document.createElement('style');
      style.textContent =
        '@keyframes bp-identify-blink{from{background:rgba(59,130,246,0.55)}to{background:rgba(139,92,246,0.65)}}';
      document.head.appendChild(style);
      document.body.appendChild(ov);
    }
    ov.innerHTML =
      '<div style="background:rgba(0,0,0,0.85);border:3px solid var(--blue-500);border-radius:1.5rem;padding:2rem 4rem;text-align:center;max-width:80vw;">' +
      '<div style="font-size:2.5rem;font-weight:900;color:var(--color-white);margin-bottom:0.5rem;">' +
      bpIcon('tv') +
      ' ' +
      escHtml(label) +
      '</div>' +
      '<div style="font-size:1rem;color:var(--slate-400);">' +
      escHtml(window.T('kiosk.identify')) +
      '</div>' +
      '</div>';
    ov.style.display = 'flex';
    clearTimeout(ov._t);
    ov._t = setTimeout(() => {
      ov.style.display = 'none';
    }, durationMs ?? 5000);
  }

  setupSocketListeners() {
    let _screenId = localStorage.getItem('bp_screen_id');
    if (!_screenId) {
      _screenId = 'scr_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('bp_screen_id', _screenId);
    }
    this.socket.on('connect', () => {
      this.updateConnectionStatus(true);
      this.socket.emit('join_arena', { arenaId: this.arenaId, role: 'public' });
      this.socket.emit('client:register', {
        clientType: 'public',
        arenaId: this.arenaId,
        userAgent: navigator.userAgent,
        screenId: _screenId,
      });
    });

    this.socket.on('server:command', cmd => {
      if (cmd.type === 'refresh') {
        location.reload();
        return;
      }
      if (cmd.type === 'navigate' && cmd.url) {
        location.href = cmd.url;
        return;
      }
      if (cmd.type === 'ping') {
        this.socket.emit('client:pong');
        return;
      }
      if (cmd.type === 'identify') {
        const lbl = cmd.screenLabel || localStorage.getItem('bp_screen_label') || _screenId;
        if (cmd.screenLabel) localStorage.setItem('bp_screen_label', cmd.screenLabel);
        this.showIdentifyOverlay(lbl, cmd.duration ?? 5000);
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
      if (cmd.type === 'public:theme') {
        applyScreenTheme(cmd.variables);
      }
    });

    setInterval(() => {
      if (this.socket.connected) this.socket.emit('client:pong');
    }, 30000);

    this.socket.on('disconnect', () => {
      this.updateConnectionStatus(false);
    });

    this.socket.on(`arena:${this.arenaId}:update`, data => {
      this.handleArenaUpdate(data);
    });

    this.socket.on(`arena:${this.arenaId}:card_announcement`, ann => {
      this.showCardAnnouncement(ann);
    });

    this.socket.on(`arena:${this.arenaId}:coin_flip`, data => {
      if (data.priority) return window.BPPriorityDraw.fromEvent(this, data); // minute prioritaire (#1442)
      this.showCoinFlipAnimation(data.winner, data.fencerA, data.fencerB);
    });
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

    const fA = this.inversionEnabled ? fencerB : fencerA;
    const fB = this.inversionEnabled ? fencerA : fencerB;
    const nameA = fA ? `${fA.lastName || ''} ${fA.firstName || ''}`.trim() || 'VERT' : 'VERT';
    const nameB = fB ? `${fB.lastName || ''} ${fB.firstName || ''}`.trim() || 'ROUGE' : 'ROUGE';
    nameGreen.textContent = nameA;
    nameRed.textContent = nameB;

    result.className = 'hidden';
    result.textContent = '';
    coin.style.transition = 'none';
    coin.style.transform = 'rotateY(0deg)';

    overlay.classList.remove('hidden');

    const visualWinner = this.inversionEnabled ? (winner === 'A' ? 'B' : 'A') : winner;
    const finalDeg = visualWinner === 'A' ? 3600 : 3780;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        coin.style.transition = 'transform 3.5s cubic-bezier(0.33, 1, 0.68, 1)';
        coin.style.transform = `rotateY(${finalDeg}deg)`;
      });
    });

    setTimeout(() => {
      const winnerName = visualWinner === 'A' ? nameA : nameB;
      const colorClass = visualWinner === 'A' ? 'winner-red' : 'winner-green';
      const colorLabel = visualWinner === 'A' ? 'ROUGE' : 'VERT';
      result.textContent = `${winnerName} gagne ! (${colorLabel})`;
      result.className = colorClass;
    }, 3600);

    setTimeout(() => {
      overlay.classList.add('hidden');
    }, 8000);
  }

  showCardAnnouncement(ann) {
    const banner = document.getElementById('card-announcement-banner');
    if (!banner) return;

    const typeLabel =
      ann.cardType === 'white'
        ? 'BLANC'
        : ann.cardType === 'yellow'
          ? 'JAUNE'
          : ann.cardType === 'red'
            ? 'ROUGE'
            : 'NOIR';
    let line1;

    if (ann.isRevalorisation) {
      const fromLabel =
        ann.fromCard === 'white' ? 'blanc' : ann.fromCard === 'yellow' ? 'jaune' : ann.fromCard;
      line1 = `Revalorisation 2ème ${fromLabel} → ${typeLabel} — ${ann.fencerName}`;
    } else {
      line1 = `Carton ${typeLabel} — ${ann.fencerName}`;
    }
    const line2 = ann.reason || null;

    setBannerLines(banner, line1, line2);
    const cardClass = ['white', 'yellow', 'red', 'black'].includes(ann.cardType)
      ? ann.cardType
      : 'yellow';
    banner.className = `card-announcement-banner visible card-${cardClass}`;

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
    // Tireur prioritaire : cadre doré effacé dès que le match change (#1442)
    if (this._prioFencerId && data.match !== undefined) {
      const m = data.match;
      if (window.BPPriorityDraw.isOtherMatch(m, this._prioFencerId)) {
        this._prioFencerId = null;
        this.applyPriorityFrame(null);
      }
    }
    if (data.screenThemes?.public) {
      applyScreenTheme(data.screenThemes.public.variables);
    }

    if (data.showPhotos !== undefined) {
      this.showPhotos = data.showPhotos;
    }

    // L'inversion public est locale — on ignore data.swapped

    if (data.status) {
      this.matchStatus = data.status;
      this.updateStatusBadge();
    }

    if (data.refereeSelected !== undefined) {
      this.refereeSelected = data.refereeSelected;
    }
    if (data.status === 'in_progress' || data.status === 'finished') {
      this.refereeSelected = true;
    }
    if (data.status === 'idle') {
      this.refereeSelected = false;
    }

    if (
      data.match &&
      (this.refereeSelected || data.status === 'in_progress' || data.status === 'finished')
    ) {
      this.currentMatch = data.match;
      this.updateMatchDisplay();
      if (this.matchStatus === 'ready' && this.showPhotos) {
        this.updatePhotoIntro();
      }
    }

    if (data.scoreA !== undefined) {
      document.getElementById(this.inversionEnabled ? 'score-a' : 'score-b').textContent =
        data.scoreA;
    }
    if (data.scoreB !== undefined) {
      document.getElementById(this.inversionEnabled ? 'score-b' : 'score-a').textContent =
        data.scoreB;
    }

    if (data.cardsA) {
      this.cardsA = data.cardsA;
      this.updateCardsDisplay();
    }
    if (data.cardsB) {
      this.cardsB = data.cardsB;
      this.updateCardsDisplay();
    }

    if (data.time !== undefined) {
      this.timerSeconds = data.time;
      this.updateTimerDisplay(data.timerStatus);
    }

    if (data.suddenDeath !== undefined) {
      this.isSuddenDeath = data.suddenDeath;
    }
    if (data.overtimeType !== undefined) {
      this.overtimeType = data.overtimeType;
    }
    this.updateSuddenDeathBanner();

    this.updateVisibility();
  }

  updateStatusBadge() {
    const badge = document.getElementById('match-status');
    badge.className = 'match-status-badge';

    switch (this.matchStatus) {
      case 'idle':
      case 'not_started':
        badge.textContent = window.T('arena.status_waiting');
        badge.classList.add('status-waiting');
        break;
      case 'ready':
      case 'in_progress':
        badge.textContent = window.T('arena.status_in_progress');
        badge.classList.add('status-progress');
        break;
      case 'finished':
        badge.textContent = window.T('arena.status_finished');
        badge.classList.add('status-finished');
        break;
    }
  }

  updateMatchDisplay() {
    if (!this.currentMatch) return;

    const fA = this.currentMatch.fencerA || {};
    const fB = this.currentMatch.fencerB || {};
    const left = this.inversionEnabled ? fA : fB;
    const right = this.inversionEnabled ? fB : fA;

    document.getElementById('fencer-a-name').textContent =
      `${left.lastName || ''} ${left.firstName || ''}`.trim() || '-';
    document.getElementById('fencer-a-club').textContent = left.club || '';

    document.getElementById('fencer-b-name').textContent =
      `${right.lastName || ''} ${right.firstName || ''}`.trim() || '-';
    document.getElementById('fencer-b-club').textContent = right.club || '';

    const sA = this.currentMatch.scoreA;
    const sB = this.currentMatch.scoreB;
    const valA = (typeof sA === 'object' ? (sA?.value ?? 0) : sA) ?? 0;
    const valB = (typeof sB === 'object' ? (sB?.value ?? 0) : sB) ?? 0;
    document.getElementById('score-a').textContent = this.inversionEnabled ? valA : valB;
    document.getElementById('score-b').textContent = this.inversionEnabled ? valB : valA;

    this.applyInversionColors();
  }

  applyInversionColors() {
    const inv = this.inversionEnabled;
    const dispA = document.getElementById('fencer-a-display');
    const dispB = document.getElementById('fencer-b-display');
    if (dispA) dispA.className = `fencer-display ${inv ? 'green-side' : 'red-side'}`;
    if (dispB) dispB.className = `fencer-display ${inv ? 'red-side' : 'green-side'}`;
    const badgeA = document.getElementById('color-badge-a');
    const badgeB = document.getElementById('color-badge-b');
    if (badgeA) badgeA.className = `color-badge ${inv ? 'green' : 'red'}`;
    if (badgeB) badgeB.className = `color-badge ${inv ? 'red' : 'green'}`;
    const scoreA = document.getElementById('score-a');
    const scoreB = document.getElementById('score-b');
    if (scoreA) {
      scoreA.className = scoreA.className.replace(/\b(green|red)\b/, inv ? 'green' : 'red');
    }
    if (scoreB) {
      scoreB.className = scoreB.className.replace(/\b(green|red)\b/, inv ? 'red' : 'green');
    }
    window.BPPriorityDraw.refreshFrame(this); // className réécrit : le cadre doré reste sur le désigné (#1442)
  }

  updateCardsDisplay() {
    const renderCards = cards =>
      cards
        .filter(card => ['white', 'yellow', 'red', 'black'].includes(card))
        .map(
          card =>
            `<div class="card card-${escHtml(card)}">${card === 'white' ? 'B' : card === 'yellow' ? 'J' : 'R'}</div>`
        )
        .join('');

    document.getElementById('fencer-a-cards').innerHTML = renderCards(
      this.inversionEnabled ? this.cardsA : this.cardsB
    );
    document.getElementById('fencer-b-cards').innerHTML = renderCards(
      this.inversionEnabled ? this.cardsB : this.cardsA
    );
  }

  updateTimerDisplay(timerStatus) {
    // Interpolation locale : dixièmes/centièmes qui s'écoulent sous 10 s (#1416)
    if (!this._smoothTimer) {
      this._smoothTimer = window.BPTimer.createSmoothTimer(t =>
        this.renderTimerAt(t, this._timerStatus)
      );
    }
    this._timerStatus = timerStatus;
    this._smoothTimer.update(this.timerSeconds, timerStatus);
  }

  renderTimerAt(timeSec, timerStatus) {
    const timerEl = document.getElementById('timer-display');
    window.BPTimer.renderTimer(timerEl, timeSec);

    timerEl.className = 'timer-display';

    if (timerStatus === 'running') {
      timerEl.classList.add('running');
    } else if (timerStatus === 'paused') {
      timerEl.classList.add('paused');
    }

    if (timeSec <= 0) {
      timerEl.classList.add('expired'); // 00:00 : rouge fixe, sans clignotement (#1416)
    } else if (timeSec <= 10) {
      timerEl.classList.add('danger');
    } else if (timeSec <= 30) {
      timerEl.classList.add('warning');
    }
  }

  updateSuddenDeathBanner() {
    const banner = document.getElementById('sudden-death-banner');
    const msBanner = document.getElementById('mort-subite-banner');

    const isSupplementary =
      this.isSuddenDeath &&
      (this.overtimeType === 'supplementary' || this.overtimeType === 'challenger_supplementary');
    const isChallengerSD =
      this.isSuddenDeath &&
      (this.overtimeType === 'challenger' || this.overtimeType === 'challenger_supplementary');

    if (banner) {
      if (isSupplementary) {
        banner.classList.add('active');
      } else {
        banner.classList.remove('active');
      }
    }
    if (msBanner) {
      if (isChallengerSD) {
        msBanner.classList.add('active');
      } else {
        msBanner.classList.remove('active');
      }
    }
  }

  updateVisibility() {
    const waitingScreen = document.getElementById('waiting-screen');
    const matchDisplay = document.getElementById('match-display');
    const photoIntro = document.getElementById('photo-intro');

    if (
      this.matchStatus === 'idle' ||
      this.matchStatus === 'not_started' ||
      (this.matchStatus === 'ready' && !this.refereeSelected)
    ) {
      waitingScreen.classList.remove('hidden');
      matchDisplay.classList.remove('active');
      photoIntro.classList.add('hidden');
      this.isSuddenDeath = false;
      this.overtimeType = null;
      this.updateSuddenDeathBanner();
    } else if (this.matchStatus === 'ready' && this.showPhotos && this.currentMatch) {
      waitingScreen.classList.add('hidden');
      matchDisplay.classList.remove('active');
      photoIntro.classList.remove('hidden');
      this.updatePhotoIntro();
    } else {
      waitingScreen.classList.add('hidden');
      photoIntro.classList.add('hidden');
      matchDisplay.classList.add('active');
    }
  }

  updatePhotoIntro() {
    if (!this.currentMatch) return;
    const fA = this.currentMatch.fencerA || {};
    const fB = this.currentMatch.fencerB || {};

    document.getElementById('intro-name-a').textContent =
      `${fA.lastName || ''} ${fA.firstName || ''}`.trim() || '-';
    document.getElementById('intro-club-a').textContent = fA.club || '';

    document.getElementById('intro-name-b').textContent =
      `${fB.lastName || ''} ${fB.firstName || ''}`.trim() || '-';
    document.getElementById('intro-club-b').textContent = fB.club || '';

    this.setFencerPhoto('a', fA.photo);
    this.setFencerPhoto('b', fB.photo);
  }

  setFencerPhoto(side, photoBase64) {
    const img = document.getElementById(`photo-${side}`);
    const icon = document.getElementById(`default-icon-${side}`);
    if (photoBase64) {
      img.src = photoBase64.startsWith('data:')
        ? photoBase64
        : `data:image/jpeg;base64,${photoBase64}`;
      img.style.display = 'block';
      icon.style.display = 'none';
    } else {
      img.style.display = 'none';
      icon.style.display = 'block';
    }
  }
}

// Démarrer l'affichage (hors tests : module.exports défini)
if (typeof module === 'undefined')
  document.addEventListener('DOMContentLoaded', async () => {
    await window.initRemoteI18n();
    document.title = window.T('public.title');
    new PublicDisplay();
  });

if (typeof module !== 'undefined' && module.exports) module.exports = { PublicDisplay };
