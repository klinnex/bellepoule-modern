/**
 * BellePoule Modern - Tablette arbitre : RefereeAppBase (1re moitié de RefereeApp : init, socket, affichage, chrono).
 * Extrait de referee.html (#1600) ; RefereeApp (/js/refereeApp.js) en hérite et doit être chargé après.
 * Script classique chargé en <script src="/js/refereeAppBase.js"> (CSP : pas de script inline).
 * Licensed under GPL-3.0
 */
/* global bpIcon, bpSocket, BPRefereeCards, BPRefereeFeedback, BPRefereeScoring, BPRefereeTimer, FAULT_REASONS, FAULT_REASONS_OLYMPIC, OfflineQueueInline, PASSIVITY_CARDS, escHtml, isStandardCard, lastIndexWhere */
/* exported RefereeAppBase */
const applyScreenTheme = variables => window.BPArenaUtils.applyScreenTheme(document, variables);
// escHtml : helper partagé (/common.js)
class RefereeAppBase {
  constructor(slotArenaId) {
    this.socket = bpSocket();
    this.baseArenaId = this.getArenaId();
    this.arenaId = slotArenaId || this.baseArenaId;
    this.arenaNumber = this.arenaNumberFromId();
    {
      const cbParam = new URLSearchParams(window.location.search).get('cb');
      let cbStored = null;
      try {
        cbStored = localStorage.getItem('bp_colorblind');
      } catch (_) {
        /* stockage indisponible */
      }
      const cbOn = cbParam !== null ? cbParam === '1' : cbStored === '1';
      if (cbOn) this.toggleColorblind(true);
    }
    this.poolId = null;
    this.matches = [];
    this.allMatches = [];
    this.currentMatch = null;
    this.scoreA = 0;
    this.scoreB = 0;
    this.cardsA = [];
    this.cardsB = [];
    this.touchesA = []; // zones touchées par A : 'A' | 'B' | 'C'
    this.touchesB = []; // zones touchées par B : 'A' | 'B' | 'C'
    this.faultHistoryA = { 1: 0, 2: 0, 3: 0 };
    this.faultHistoryB = { 1: 0, 2: 0, 3: 0 };
    this.matchStatus = 'not_started';
    this.defaultTimerSeconds = 180; // durée par défaut, mise à jour depuis les settings
    this.timerSeconds = 180; // 3 minutes
    this.timerInterval = null;
    this.timerRunning = false;
    this.longPressTimer = null;
    this.isLaserSabre = false;
    this.customScoring = null; // Système de score de la formule personnalisée (#1125)
    this.isModernFencing = false; // Épée, fleuret, sabre (règles olympiques)
    this.restSeconds = 0; // Repos entre périodes (paramètre compétition, 0 = désactivé, #1134)
    this.isSuddenDeath = false;
    this.waitingOvertimeStart = false;
    this.waitingCoinFlip = false;
    this.isResting = false;
    this.overtimeType = null; // 'supplementary' | 'challenger' | null
    this.coinFlipWinner = null; // 'A' | 'B' | null — vainqueur par tirage au sort
    this._pendingBlackCardFencer = null; // fenceur en attente de carton noir
    this.actionHistory = []; // Historique pour undo (max 10)
    this.cardAnnounceEnabled = false; // Réglé depuis les paramètres de saisie distante
    this.refereeFeatureEnabled = false; // Fonctionnalité gestion arbitres
    this.blackCardEnabled = false; // Carton noir (paramètre compétition, désactivé par défaut)
    this.refereesList = []; // Liste des arbitres de la compétition
    this.swapped = false;
    this.leftyRed = false;
    this.weapon = null; // arme de la session (/api/session)
    this.pausedForModal = false;
    this.trainingCustomRules = null; // { matchDurationSeconds, allowedZones, disableSuddenDeath }
    this.offlineQueue = new OfflineQueueInline();
    this.ttsEnabled = false;
    this._ttsAnnouncedSeconds = new Set();
    // Config TTS poussée depuis les paramètres globaux de l'application
    this.ttsConfig = {
      voiceName: null,
      rate: 1.1,
      announce: { 60: true, 30: true, 10: true, 5: true, countdown: true, 0: true },
    };

    this.init();
  }

  getArenaId() {
    const path = window.location.pathname;
    const match = path.match(/arene(\d+)/i) || path.match(/arena(\d+)/i);
    return match ? `arena${match[1]}` : 'arena1';
  }

  arenaNumberFromId() {
    return this.baseArenaId.replace('arena', '');
  }

  init() {
    const slotNum = (/s(\d+)$/.exec(this.arenaId) || [])[1]; // sous-piste « 3 · 2 » (#1118)
    const arenaLabel = slotNum ? `${this.arenaNumber} · ${slotNum}` : this.arenaNumber;
    document.getElementById('arena-number').textContent = arenaLabel;
    document.getElementById('next-arena-number').textContent = arenaLabel;
    this.setupSocketListeners();
    this.setupTimerInteractions();
    this.setupLongPressInteractions();
    this.setupBatteryMonitor();
    this.applyBlackCardSetting();
    this.showNextMatchesScreen();
    // Détecter l'arme de la compétition pour la mort subite Laser Sabre
    fetch('/api/session')
      .then(r => (r.ok ? r.json() : null))
      .then(s => {
        if (s) {
          this.weapon = s.weapon || null; // placement gaucher/droitier (#1439)
          this.isLaserSabre = s.weapon === 'L';
          this.customScoring = s.weapon === 'C' ? s.customScoring || null : null;
          this.applyScoringButtons();
          // Formule personnalisée : règles choisies dans la formule (#1125)
          this.isModernFencing = ['E', 'F', 'S'].includes(s.weapon) || s.modernRules === true;
          this.rulesLoaded = true;
          if (s.trainingCustomRules) this.trainingCustomRules = s.trainingCustomRules;
          this.blackCardEnabled = s.blackCardEnabled === true;
          this.applyBlackCardSetting();
          if (this.isModernFencing) {
            const pisteLabel = window.T('remote.piste');
            document.getElementById('arena-label').textContent = pisteLabel;
            const nextLabel = document.getElementById('next-arena-label');
            if (nextLabel) nextLabel.textContent = pisteLabel;
            if (!this.customScoring) {
              // Olympique : pas de +1 ni de +3/+5 ; le point s'ajoute au clic sur la case score (#1713)
              document
                .querySelectorAll('.btn-plus-1, .btn-plus-3, .btn-plus-5')
                .forEach(b => (b.style.display = 'none'));
              this.setupOlympicScoreTap();
            }
            this.updateRestButton();
            // Carton blanc remplacé par le carton de passivité (#1026)
            ['btn-card-white-a', 'btn-card-white-b'].forEach(id => {
              const b = document.getElementById(id);
              if (!b) return;
              b.textContent = 'P';
              b.title = window.T('referee.passivity_title');
              b.classList.add('card-btn-passivity');
            });
            ['btn-card-yellow-a', 'btn-card-yellow-b'].forEach(id => {
              const b = document.getElementById(id);
              if (b) b.title = window.T('referee.yellow_warning_title');
            });
            ['btn-card-red-a', 'btn-card-red-b'].forEach(id => {
              const b = document.getElementById(id);
              if (b) b.title = window.T('referee.red_plus1_title');
            });
          }
        }
      })
      .catch(() => {});
    // Config TTS (voix + paliers annoncés) depuis les paramètres globaux
    fetch('/api/tts-config')
      .then(r => (r.ok ? r.json() : null))
      .then(c => {
        if (c) this.applyTtsConfig(c);
      })
      .catch(() => {});
    // Service Worker PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch(err => console.warn('[SW] Enregistrement échoué:', err));
    }
    // Indicateurs hors-ligne
    window.addEventListener('online', () => {
      this.updateConnectionUI(true);
      this.syncOfflineQueue();
    });
    window.addEventListener('offline', () => {
      this.updateConnectionUI(false);
    });
    this.updateConnectionUI(navigator.onLine);
  }

  // Affiche/masque les boutons carton noir selon le paramètre de la compétition
  applyBlackCardSetting() {
    ['btn-card-black-a', 'btn-card-black-b'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.style.display = this.blackCardEnabled ? '' : 'none';
    });
    if (!this.blackCardEnabled && this._pendingBlackCardFencer) this.cancelBlackCard();
  }

  updateConnectionUI(online) {
    // La dot est pilotée par l'état socket ; ici seulement le badge de synchronisation
    this._online = online;
    this.updateOfflineBadge();
  }

  showSyncIndicator(show) {
    this._syncing = show;
    this.renderSyncBadge(this._pending || 0);
  }

  renderSyncBadge(pending) {
    const el = document.getElementById('sync-badge');
    if (!el) return;
    const online = this._online !== false;
    const state = OfflineQueueInline.badgeState(online, !!this._syncFailed);
    el.className = 'sync-badge ' + state;
    // Badge = file des scores hors-ligne ; le point de connexion couvre déjà le temps réel.
    // En ligne sans rien à envoyer : masqué, pour n'afficher qu'un seul état (#1500)
    el.hidden = state === 'online' && !this._syncing && !(pending > 0);
    if (state === 'offline') {
      el.textContent =
        pending > 0
          ? window.T('referee.sync_offline_pending', { n: pending })
          : window.T('referee.sync_offline');
    } else if (state === 'failed') {
      el.textContent = window.T('referee.sync_failed');
    } else {
      el.textContent = this._syncing
        ? window.T('remote.syncing')
        : pending > 0
          ? window.T('referee.sync_pending', { n: pending })
          : window.T('referee.sync_online');
    }
  }

  async updateOfflineBadge() {
    const count = await this.offlineQueue.getQueueSize().catch(() => 0);
    this._pending = count;
    if (count === 0) this._syncFailed = false;
    this.renderSyncBadge(count);
  }

  retrySync() {
    this.syncOfflineQueue();
  }

  async syncOfflineQueue() {
    const size = await this.offlineQueue.getQueueSize().catch(() => 0);
    if (size === 0) return;
    this.showSyncIndicator(true);
    const result = await this.offlineQueue
      .sync('/api/sync')
      .catch(() => ({ synced: 0, failed: size }));
    this._syncFailed = result.failed > 0;
    this.showSyncIndicator(false);
    this.updateOfflineBadge();
    if (result.synced > 0) this.showNotification(window.T('referee.synced', { n: result.synced }));
  }

  // Olympique (#1713) : un clic sur la case score du tireur ajoute 1 point
  setupOlympicScoreTap() {
    ['A', 'B'].forEach(fencer => {
      const el = document.getElementById(`score-${fencer.toLowerCase()}`);
      if (!el || el.dataset.tapBound) return;
      el.dataset.tapBound = '1';
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        if (!this.isModernFencing || this.customScoring) return;
        this.addScore(fencer, this.slotPoints(1));
      });
    });
  }

  setupLongPressInteractions() {
    const LONG_PRESS_DURATION = 800;

    // Configuration des boutons de score avec long press
    const scoreButtonConfigs = [
      { id: 'btn-plus-1-a', fencer: 'A', points: 1 },
      { id: 'btn-plus-3-a', fencer: 'A', points: 3 },
      { id: 'btn-plus-5-a', fencer: 'A', points: 5 },
      { id: 'btn-plus-1-b', fencer: 'B', points: 1 },
      { id: 'btn-plus-3-b', fencer: 'B', points: 3 },
      { id: 'btn-plus-5-b', fencer: 'B', points: 5 },
    ];

    scoreButtonConfigs.forEach(config => {
      const btn = document.getElementById(config.id);
      if (!btn) return;

      let longPressTimer = null;

      // Mouse events
      btn.addEventListener('mousedown', e => {
        btn.classList.add('long-press-active');
        longPressTimer = setTimeout(() => {
          btn.classList.remove('long-press-active');
          this.removeScore(config.fencer, this.slotPoints(config.points));
          longPressTimer = null;
        }, LONG_PRESS_DURATION);
      });

      btn.addEventListener('mouseup', e => {
        if (longPressTimer) {
          // Appui court : ajouter le score
          clearTimeout(longPressTimer);
          longPressTimer = null;
          this.addScore(config.fencer, this.slotPoints(config.points));
        }
        btn.classList.remove('long-press-active');
      });

      btn.addEventListener('mouseleave', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        btn.classList.remove('long-press-active');
      });

      // Touch events pour mobile
      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        btn.classList.add('long-press-active');
        longPressTimer = setTimeout(() => {
          btn.classList.remove('long-press-active');
          this.removeScore(config.fencer, this.slotPoints(config.points));
          longPressTimer = null;
        }, LONG_PRESS_DURATION);
      });

      btn.addEventListener('touchend', e => {
        e.preventDefault(); // empêche les ghost clicks souris
        if (longPressTimer) {
          // Appui court : ajouter le score
          clearTimeout(longPressTimer);
          longPressTimer = null;
          this.addScore(config.fencer, this.slotPoints(config.points));
        }
        btn.classList.remove('long-press-active');
      });

      btn.addEventListener('touchcancel', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        btn.classList.remove('long-press-active');
      });
    });

    // Configuration des boutons de cartons avec long press
    const cardButtonConfigs = [
      { id: 'btn-card-white-a', fencer: 'A', cardType: 'white' },
      { id: 'btn-card-yellow-a', fencer: 'A', cardType: 'yellow' },
      { id: 'btn-card-red-a', fencer: 'A', cardType: 'red' },
      { id: 'btn-card-white-b', fencer: 'B', cardType: 'white' },
      { id: 'btn-card-yellow-b', fencer: 'B', cardType: 'yellow' },
      { id: 'btn-card-red-b', fencer: 'B', cardType: 'red' },
    ];

    cardButtonConfigs.forEach(config => {
      const btn = document.getElementById(config.id);
      if (!btn) return;

      let longPressTimer = null;

      // Mouse events
      btn.addEventListener('mousedown', e => {
        btn.classList.add('long-press-active');
        longPressTimer = setTimeout(() => {
          btn.classList.remove('long-press-active');
          this.removeCardFromButton(config);
          longPressTimer = null;
        }, LONG_PRESS_DURATION);
      });

      btn.addEventListener('mouseup', e => {
        if (longPressTimer) {
          // Appui court : ajouter le carton
          clearTimeout(longPressTimer);
          longPressTimer = null;
          this.handleCardButtonPress(config.fencer, config.cardType);
        }
        btn.classList.remove('long-press-active');
      });

      btn.addEventListener('mouseleave', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        btn.classList.remove('long-press-active');
      });

      // Touch events pour mobile
      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        btn.classList.add('long-press-active');
        longPressTimer = setTimeout(() => {
          btn.classList.remove('long-press-active');
          this.removeCardFromButton(config);
          longPressTimer = null;
        }, LONG_PRESS_DURATION);
      });

      btn.addEventListener('touchend', e => {
        e.preventDefault(); // empêche les ghost clicks souris
        if (longPressTimer) {
          // Appui court : ajouter le carton
          clearTimeout(longPressTimer);
          longPressTimer = null;
          this.handleCardButtonPress(config.fencer, config.cardType);
        }
        btn.classList.remove('long-press-active');
      });

      btn.addEventListener('touchcancel', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        btn.classList.remove('long-press-active');
      });
    });

    // Icône DT : tap court = appel, appui long = annulation
    const dtIcon = document.getElementById('btn-dt-icon');
    if (dtIcon) {
      let dtLongPressTimer = null;
      let dtLongPressTriggered = false;

      const dtDown = () => {
        dtLongPressTriggered = false;
        dtLongPressTimer = setTimeout(() => {
          dtLongPressTriggered = true;
          dtLongPressTimer = null;
          this.cancelDTCall();
        }, 600);
      };
      const dtUp = e => {
        if (dtLongPressTimer) {
          clearTimeout(dtLongPressTimer);
          dtLongPressTimer = null;
        }
        if (!dtLongPressTriggered) this.callDT();
      };
      const dtCancel = () => {
        if (dtLongPressTimer) {
          clearTimeout(dtLongPressTimer);
          dtLongPressTimer = null;
        }
      };

      dtIcon.addEventListener('mousedown', dtDown);
      dtIcon.addEventListener('mouseup', dtUp);
      dtIcon.addEventListener('mouseleave', dtCancel);
      dtIcon.addEventListener('touchstart', e => {
        e.preventDefault();
        dtDown();
      });
      dtIcon.addEventListener('touchend', e => {
        e.preventDefault();
        dtUp(e);
      });
      dtIcon.addEventListener('touchcancel', dtCancel);
    }
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
      bpIcon('users') +
      ' ' +
      escHtml(label) +
      '</div>' +
      '<div style="font-size:1rem;color:var(--slate-400);">' +
      escHtml(window.T('referee.identify')) +
      '</div>' +
      '</div>';
    ov.style.display = 'flex';
    clearTimeout(ov._t);
    ov._t = setTimeout(() => {
      ov.style.display = 'none';
    }, durationMs ?? 5000);
  }

  setupSocketListeners() {
    // Identifiant persistant de cette tablette (survit aux rechargements/reconnexions)
    const _screenId = window.bpScreenId() || 'scr_anon';

    // Mise à jour live de la config TTS depuis les paramètres globaux
    this.socket.on('tts:update', d => {
      if (d) this.applyTtsConfig(d);
    });

    this.socket.on('connect', () => {
      this.updateConnectionStatus(true);
      this.socket.emit('join_arena', { arenaId: this.arenaId, role: 'referee' });
      this.socket.emit('client:register', {
        clientType: 'referee',
        arenaId: this.arenaId,
        userAgent: navigator.userAgent,
        screenId: _screenId,
      });
      this.showNotification(window.T('referee.connected_server'));
      // Synchroniser les actions mises en file hors-ligne
      this.syncOfflineQueue();
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
        this.showNotification(cmd.text);
      }
      if (cmd.type === 'referee:theme') {
        applyScreenTheme(cmd.variables);
      }
    });

    setInterval(() => {
      if (this.socket.connected) this.socket.emit('client:pong');
    }, 30000);

    this.socket.on('disconnect', () => {
      this.updateConnectionStatus(false);
      this.showNotification(window.T('remote.disconnected'), true);
    });

    this.socket.on('connect_error', err => {
      this.updateConnectionStatus(false);
      const text = document.getElementById('connection-text');
      if (text) text.textContent = err?.message || window.T('referee.network_error');
    });

    this.socket.on('auth_error', () => {
      this.socket.disconnect();
      window.location.href = `/login?arena=${this.arenaId}&return=${encodeURIComponent(window.location.pathname)}`;
    });

    this.socket.on(`arena:${this.arenaId}:update`, data => {
      this.handleArenaUpdate(data);
    });

    // Signature renvoyée depuis le poste DT (match de tableau non signé)
    this.socket.on(`arena:${this.arenaId}:sign_request`, req => {
      if (!req?.match?.id || !req.match.fencerA?.id || !req.match.fencerB?.id) return;
      this.openMatchSignature(req.match, req.scoreA ?? 0, req.scoreB ?? 0);
    });

    this.socket.on(`arena:${this.arenaId}:score_limit_reached`, () => {
      this.showFinishModal();
    });

    this.socket.on(`arena:${this.arenaId}:dt_call_ack`, () => {
      const btn = document.getElementById('btn-dt-icon');
      if (btn) {
        btn.classList.remove('dt-active');
        btn.classList.add('dt-ack');
        btn.title = window.T('referee.dt_en_route_title');
      }
      this.showNotification(window.T('referee.dt_en_route_notif'));
      setTimeout(() => {
        this._resetDTButton();
        const b = document.getElementById('btn-dt-icon');
        if (b) b.title = window.T('referee.dt_call_title');
      }, 10000);
    });
  }

  setupTimerInteractions() {
    const timerDisplay = document.getElementById('timer-display');

    // Click simple : démarre le match si pas encore commencé, sinon play/pause
    timerDisplay.addEventListener('click', e => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
        return;
      }
      this.handleStartPauseClick();
    });

    // Appui long : reset
    timerDisplay.addEventListener('mousedown', e => {
      this.longPressTimer = setTimeout(() => {
        this.resetTimer();
        this.longPressTimer = null;
      }, 800);
    });

    timerDisplay.addEventListener('mouseup', e => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    });

    timerDisplay.addEventListener('mouseleave', e => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    });

    // Touch events pour mobile
    timerDisplay.addEventListener('touchstart', e => {
      this.longPressTimer = setTimeout(() => {
        this.resetTimer();
        this.longPressTimer = null;
      }, 800);
    });

    timerDisplay.addEventListener('touchend', e => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    });
  }

  updateConnectionStatus(connected) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('connection-text');

    if (connected) {
      dot.classList.add('connected');
      dot.classList.remove('disconnected');
      text.textContent = window.T('remote.online');
    } else {
      dot.classList.remove('connected');
      dot.classList.add('disconnected');
      text.textContent = window.T('remote.offline');
    }
  }

  setupBatteryMonitor() {
    if (!navigator.getBattery) return;
    const badge = document.getElementById('battery-badge');
    const levelSpan = document.getElementById('battery-level');
    const LOW_THRESHOLD = 0.2;
    let lastSent = 0;

    const report = (battery, force) => {
      const level = battery.level;
      const pct = Math.round(level * 100);
      const low = level <= LOW_THRESHOLD && !battery.charging;
      badge.style.display = low ? 'inline-block' : 'none';
      levelSpan.textContent = pct;
      const now = Date.now();
      if (force || now - lastSent > 60000) {
        lastSent = now;
        if (this.socket && this.socket.connected) {
          this.socket.emit('client:battery', { level, charging: battery.charging });
        }
      }
      if (low && force) {
        this.showNotification(window.T('referee.battery_low_pct', { pct }), true);
      }
    };

    navigator
      .getBattery()
      .then(battery => {
        report(battery, true);
        battery.addEventListener('levelchange', () => report(battery, true));
        battery.addEventListener('chargingchange', () => report(battery, true));
      })
      .catch(() => {});
  }

  selectMatch(matchId) {
    const match = this.matches.find(m => m.id === matchId);
    if (!match || match.status === 'finished') return;

    this.hideNextMatchesScreen();

    this.currentMatch = match;
    this.scoreA = match.scoreA?.value || 0;
    this.scoreB = match.scoreB?.value || 0;
    this.cardsA = [];
    this.cardsB = [];
    this.touchesA = [];
    this.touchesB = [];
    this.faultHistoryA = { 1: 0, 2: 0, 3: 0 };
    this.faultHistoryB = { 1: 0, 2: 0, 3: 0 };
    this.timerSeconds = this.defaultTimerSeconds;
    this.isSuddenDeath = false;
    this.waitingOvertimeStart = false;
    this.waitingCoinFlip = false;
    this.isResting = false;
    this.overtimeType = null;
    this.actionHistory = [];
    // Gaucher contre droitier : le gaucher devient rouge (à gauche), le droitier vert (#1439).
    // Couleur réelle, pas seulement l'inversion de vue : le bouton ⇄ reste inactif.
    this.swapped = false;
    this.leftyRed = !!globalThis.BPRefereeUpdate?.leftHandedSwap(this.weapon, match);
    this.stopTimer();
    const timerRestored = this.restoreTimerState(match);
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.disabled = true;

    // Charger les infos du match
    this.applySwapState();
    this.applyScoringButtons();
    this.updateTimerDisplay();
    this.updateMatchStatus();
    this.updateControlButtons();

    // Afficher le panneau de match
    document.getElementById('active-match').classList.add('visible');

    // Mettre à jour la barre arbitre
    this.updateRefereeBar();

    // Informer le serveur
    this.socket.emit('arena_control', {
      arenaId: this.arenaId,
      action: 'select_match',
      match: {
        ...match,
        scoreA: this.scoreA,
        scoreB: this.scoreB,
      },
    });
    if (timerRestored) {
      // select_match repasse l'arène en « prête » : la remettre en cours, puis diffuser le temps restauré
      this.socket.emit('arena_control', { arenaId: this.arenaId, action: 'start' });
      this.broadcastTimerUpdate();
    }
  }

  // Reprise d'un match en cours après rafraîchissement : chrono restauré, à l'arrêt (#1717).
  // « Démarrer » reprend alors le chrono au lieu de relancer le match.
  restoreTimerState(match) {
    const storage = this._timerStorage();
    if (!storage) return false;
    const saved =
      match.status === 'in_progress'
        ? BPRefereeTimer.loadTimerState(storage, this.arenaId, match.id, Date.now())
        : null;
    if (!saved) {
      BPRefereeTimer.clearTimerState(storage, this.arenaId);
      return false;
    }
    this._timerCs = saved.cs;
    this.isSuddenDeath = saved.isSuddenDeath;
    this.overtimeType = saved.overtimeType;
    this.isResting = saved.isResting;
    this.matchStatus = 'in_progress';
    return true;
  }

  // Efface le chrono mémorisé (fin de match, retour à la liste) (#1717)
  _clearStoredTimer() {
    const storage = this._timerStorage();
    if (storage) BPRefereeTimer.clearTimerState(storage, this.arenaId);
  }

  // Zones de score actives (formule personnalisée) pour le match courant, sinon null
  activeCustomZones() {
    return BPRefereeScoring.activeCustomZones(
      this.customScoring,
      !!(this.currentMatch && this.currentMatch.isTableau)
    );
  }

  // Points réellement attribués par le bouton du palier 1 / 3 / 5
  slotPoints(slot) {
    return BPRefereeScoring.slotPoints(this.activeCustomZones(), slot);
  }

  zoneLetter(points) {
    return BPRefereeScoring.zoneLetter(this.activeCustomZones(), points);
  }

  // Affiche uniquement les boutons de score du système choisi (+1 en standard)
  applyScoringButtons() {
    const zones = this.activeCustomZones();
    if (!zones) return;
    [
      [1, 'btn-plus-1'],
      [3, 'btn-plus-3'],
      [5, 'btn-plus-5'],
    ].forEach(([slot, base], idx) => {
      ['a', 'b'].forEach(side => {
        const btn = document.getElementById(`${base}-${side}`);
        if (!btn) return;
        const z = zones[idx];
        btn.style.display = z ? '' : 'none';
        if (z) btn.textContent = `+${z.points}`;
        btn.title = z && z.label ? z.label : '';
      });
    });
  }

  addScore(fencer, points) {
    const check = BPRefereeScoring.validateAddScore({
      hasMatch: !!this.currentMatch,
      matchStatus: this.matchStatus,
      isSuddenDeath: this.isSuddenDeath,
      overtimeType: this.overtimeType,
      points,
      zone: this.zoneLetter(points),
      trainingCustomRules: this.trainingCustomRules,
    });
    if (!check.ok) {
      if (check.notify) this.showNotification(window.T(check.notify, check.params));
      return;
    }

    this.pushHistory('score');
    BPRefereeFeedback.afterScore(this, points);
    if (navigator.vibrate) navigator.vibrate(BPRefereeScoring.vibrationMs(points));

    const ef = this._effectiveFencer(fencer);
    const zone = this.zoneLetter(points);
    if (ef === 'A') {
      this.scoreA = Math.max(0, this.scoreA + points);
      this.touchesA.push(zone);
    } else {
      this.scoreB = Math.max(0, this.scoreB + points);
      this.touchesB.push(zone);
    }

    this.updateScores();

    // Olympique (#1713) : le chrono s'arrête automatiquement à la marque
    if (this.isModernFencing && !this.customScoring && this.timerRunning) this.pauseTimer();

    // Mode Challenger (Laser Sabre) : vérifier AVANT broadcastUpdate pour que le serveur
    // reçoive l'état correct
    if (BPRefereeScoring.shouldTriggerChallenger(this)) this.triggerSuddenDeathChallenger();

    this.broadcastUpdate();
    this.saveScore();
  }

  addCard(fencer, cardType) {
    if (!this.currentMatch) return;
    if (this.matchStatus === 'not_started') {
      this.showNotification(window.T('referee.start_first'));
      return;
    }
    if (this.matchStatus === 'finished') return;

    this.pushHistory('card');
    if (navigator.vibrate) navigator.vibrate(BPRefereeCards.cardVibration(cardType));

    const ef = fencer; // caller already resolved via _effectiveFencer
    const cards = ef === 'A' ? this.cardsA : this.cardsB;

    const eff = BPRefereeCards.cardEffect({
      cardType,
      isModern: this.isModernFencing,
      whiteCount: cards.filter(c => c === 'white').length,
    });
    if (eff.secondWhite) this.showNotification(window.T('referee.second_white'));
    cards.push(eff.cardType);
    if (eff.opponentPoints) {
      if (ef === 'A') this.scoreB += eff.opponentPoints;
      else this.scoreA += eff.opponentPoints;
      this.showNotification(window.T(eff.notify));
    }

    this.updateScores();
    this.updateCardsDisplay();
    this.broadcastUpdate();
    this.saveScore();
  }

  // ── Gestion carton avec sélecteur de raison ──────────────────────────

  handleCardButtonPress(fencer, cardType) {
    const ef = this._effectiveFencer(fencer);
    if (this.isModernFencing) {
      if (cardType === 'white') {
        this.addPassivityCard();
        return;
      }
      if (this.cardAnnounceEnabled) {
        this.openReasonSelector(ef, cardType);
      } else {
        this.addCard(ef, cardType === 'yellow' ? this.modernYellowOrRed(ef) : cardType);
      }
      return;
    }
    if (this.cardAnnounceEnabled) {
      this.openReasonSelector(ef, cardType);
    } else {
      if (cardType === 'yellow') {
        const history = ef === 'A' ? this.faultHistoryA : this.faultHistoryB;
        const g2count = history[2] || 0;
        if (g2count >= 1) cardType = 'red';
        this.addCard(ef, cardType);
        history[2] = g2count + 1; // après pushHistory dans addCard
      } else {
        this.addCard(ef, cardType);
      }
    }
  }

  // Escrime olympique : un jaune devient rouge si le tireur a déjà un jaune ou un rouge
  // (un rouge reçu avant tout jaune transforme les jaunes suivants en rouges) (#1026)
  modernYellowOrRed(fencer) {
    return BPRefereeCards.modernYellowOrRed(
      (fencer === 'A' ? this.cardsA : this.cardsB).filter(isStandardCard)
    );
  }

  // Carton de passivité : décerné aux deux tireurs, hors cumul des cartons classiques.
  // P-rouge : un point à chaque tireur ; P-noir : fin du combat (#1026)
  addPassivityCard() {
    if (!this.currentMatch) return;
    if (this.matchStatus === 'not_started') {
      this.showNotification(window.T('referee.start_first'));
      return;
    }
    if (this.matchStatus === 'finished') return;
    const given = this.cardsA.filter(c => PASSIVITY_CARDS.includes(c)).length;
    if (!BPRefereeCards.nextPassivityCard(given)) return;
    this.pushHistory('card');
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    if (given === 0) {
      this.cardsA.push('p-red');
      this.cardsB.push('p-red');
      this.scoreA += 1;
      this.scoreB += 1;
      this.updateScores();
      this.updateCardsDisplay();
      this.broadcastUpdate();
      this.saveScore();
      this.showNotification(window.T('referee.passivity_red'));
      return;
    }
    this.cardsA.push('p-black');
    this.cardsB.push('p-black');
    this.updateCardsDisplay();
    this.broadcastUpdate();
    this.saveScore();
    this.finishByPassivity();
  }

  // Retrait du dernier carton de passivité (appui long sur P)
  removeLastPassivityCard() {
    if (!this.currentMatch || this.matchStatus !== 'in_progress') return;
    const idxA = lastIndexWhere(this.cardsA, c => PASSIVITY_CARDS.includes(c));
    const idxB = lastIndexWhere(this.cardsB, c => PASSIVITY_CARDS.includes(c));
    if (idxA === -1 && idxB === -1) {
      this.showNotification(window.T('referee.no_card_to_remove'));
      return;
    }
    if (navigator.vibrate) navigator.vibrate(30);
    const removed = idxA !== -1 ? this.cardsA[idxA] : this.cardsB[idxB];
    if (idxA !== -1) this.cardsA.splice(idxA, 1);
    if (idxB !== -1) this.cardsB.splice(idxB, 1);
    if (removed === 'p-red') {
      this.scoreA = Math.max(0, this.scoreA - 1);
      this.scoreB = Math.max(0, this.scoreB - 1);
    }
    this.updateScores();
    this.updateCardsDisplay();
    this.broadcastUpdate();
    this.saveScore();
    this.showNotification(window.T('referee.passivity_undone'));
  }

  // P-noir : vainqueur = score le plus haut ; à égalité, le mieux classé au départ ;
  // sans classement, tirage au sort
  finishByPassivity() {
    const r = BPRefereeCards.passivityWinner({
      scoreA: this.scoreA,
      scoreB: this.scoreB,
      fencerA: this.currentMatch?.fencerA,
      fencerB: this.currentMatch?.fencerB,
    });
    if (r.action === 'finish') {
      this.confirmFinishWithCoinFlip(r.winner, window.T(r.reasonKey));
      return;
    }
    this.stopTimer();
    this.triggerTiebreaker();
  }

  determineCardFromGroup(group, fencer) {
    return BPRefereeCards.cardFromGroup(group, {
      isModern: this.isModernFencing,
      standardCards: (fencer === 'A' ? this.cardsA : this.cardsB).filter(isStandardCard),
      history: fencer === 'A' ? this.faultHistoryA : this.faultHistoryB,
    });
  }

  openReasonSelector(fencer, originalCardType) {
    this._reasonSelectorFencer = fencer;
    this._reasonSelectorOriginalType = originalCardType;

    const displayPos = this._effectiveFencer(fencer); // _effectiveFencer is its own inverse
    const nameEl = document.getElementById(`fencer-${displayPos.toLowerCase()}-name`);
    const fencerName = nameEl
      ? nameEl.textContent.trim()
      : window.T('referee.fencer_default', { pos: fencer });
    document.getElementById('reason-selector-title').textContent = window.T(
      'referee.reason_title_name',
      { name: fencerName }
    );

    // Construire la liste des raisons filtrée selon le carton cliqué
    const body = document.getElementById('reason-selector-body');
    body.innerHTML = '';
    const reasons = this.isModernFencing ? FAULT_REASONS_OLYMPIC : FAULT_REASONS;
    const filteredReasons = reasons.filter(({ group }) => {
      if (originalCardType === 'white') return group === 1;
      if (originalCardType === 'yellow') return group === 2;
      if (originalCardType === 'red') return group === 3;
      return true;
    });
    filteredReasons.forEach(({ group, labelKey, faults }) => {
      const preview = this.determineCardFromGroup(group, fencer);
      const previewLabel = window.T(
        preview === 'white'
          ? 'referee.card_white_short'
          : preview === 'yellow'
            ? 'referee.card_yellow_short'
            : 'referee.card_red_short'
      );
      const titleEl = document.createElement('div');
      titleEl.className = 'reason-group-title';
      titleEl.textContent = `${window.T(labelKey)} → ${previewLabel}`;
      body.appendChild(titleEl);

      faults.forEach(fault => {
        const btn = document.createElement('button');
        btn.className = 'reason-btn';
        btn.textContent = window.T(fault.key);
        btn.addEventListener('click', () => {
          this.confirmReasonSelector(fault.fr, group, fencer);
        });
        body.appendChild(btn);
      });
    });

    document.getElementById('reason-selector-overlay').classList.add('open');
  }

  confirmReasonSelector(reason, group, fencer) {
    const cardType = this.determineCardFromGroup(group, fencer);
    const history = fencer === 'A' ? this.faultHistoryA : this.faultHistoryB;
    const prevCount = history[group] || 0;

    const isRevalorisation = group === 1 && prevCount === 1;
    history[group] = prevCount + 1;

    document.getElementById('reason-selector-overlay').classList.remove('open');

    this.addCard(fencer, cardType);

    // Annonce avec raison
    const nameEl = document.getElementById(`fencer-${fencer.toLowerCase()}-name`);
    const fencerName = nameEl
      ? nameEl.textContent.trim()
      : window.T('referee.fencer_default', { pos: fencer });
    this.socket.emit('arena_control', {
      arenaId: this.arenaId,
      action: 'card_announcement',
      announcement: {
        fencer,
        fencerName,
        cardType,
        isRevalorisation,
        fromCard: isRevalorisation ? 'white' : null,
        toCard: isRevalorisation ? 'yellow' : null,
        reason,
        group,
      },
    });
  }

  cancelReasonSelector() {
    const fencer = this._reasonSelectorFencer;
    const originalType = this._reasonSelectorOriginalType;
    document.getElementById('reason-selector-overlay').classList.remove('open');
    if (fencer && originalType) {
      this.addCard(fencer, originalType);
    }
  }

  // Carton noir direct (bouton N) : fencer = position affichée
  requestBlackCard(fencer) {
    if (!this.blackCardEnabled || !this.currentMatch) return;
    if (this.matchStatus === 'not_started') {
      this.showNotification(window.T('referee.start_first'));
      return;
    }
    if (this.matchStatus === 'finished') return;
    const ef = this._effectiveFencer(fencer);
    this._pendingBlackCardFencer = ef;
    const nameEl = document.getElementById(`fencer-${fencer.toLowerCase()}-name`);
    const fencerName = nameEl
      ? nameEl.textContent.trim()
      : window.T('referee.fencer_default', { pos: ef });
    document.getElementById('black-card-fencer-name').textContent = fencerName;
    document.getElementById('black-card-cause').innerHTML =
      `<strong>${escHtml(window.T('referee.black_card_direct'))}</strong>`;
    document.getElementById('black-card-modal').classList.add('active');
  }

  cancelBlackCard() {
    this._pendingBlackCardFencer = null;
    document.getElementById('black-card-modal').classList.remove('active');
  }

  async confirmBlackCard() {
    const ef = this._pendingBlackCardFencer;
    this._pendingBlackCardFencer = null;
    document.getElementById('black-card-modal').classList.remove('active');
    if (!ef || !this.currentMatch) return;

    const cards = ef === 'A' ? this.cardsA : this.cardsB;
    cards.push('black'); // carton noir : pas de points, fin du combat

    this.updateScores();
    this.updateCardsDisplay();
    this.broadcastUpdate();

    this.showNotification(window.T('referee.black_card_notif'));
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    // Appel DT émis côté serveur à la réception du carton noir
    document.getElementById('btn-dt-icon')?.classList.add('dt-active');

    // Terminer le match : l'adversaire du fautif est vainqueur
    this.matchStatus = 'finished';
    this._clearStoredTimer();
    this.stopTimer();

    try {
      await fetch(`/api/matches/${this.currentMatch.id}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scoreA: this.scoreA,
          scoreB: this.scoreB,
          cardsA: this.cardsA,
          cardsB: this.cardsB,
          winner: ef === 'A' ? 'B' : 'A',
          blackCardFencer: ef,
        }),
      });
    } catch (e) {
      console.error('[BlackCard] Erreur finish:', e);
    }

    this.updateMatchStatus();
    this.updateControlButtons();

    this.socket.emit('arena_control', {
      arenaId: this.arenaId,
      action: 'finish',
    });

    setTimeout(() => {
      this.currentMatch = null;
      this.scoreA = 0;
      this.scoreB = 0;
      this.cardsA = [];
      this.cardsB = [];
      this.faultHistoryA = { 1: 0, 2: 0, 3: 0 };
      this.faultHistoryB = { 1: 0, 2: 0, 3: 0 };
      this.matchStatus = 'not_started';
      this.updateScores();
      this.updateCardsDisplay();
      this.loadNextMatchList();
    }, 3000);
  }

  // ── Historique / Undo ─────────────────────────────────────────────────

  pushHistory(type) {
    const snapshot = {
      type,
      scoreA: this.scoreA,
      scoreB: this.scoreB,
      cardsA: [...this.cardsA],
      cardsB: [...this.cardsB],
      faultHistoryA: { ...this.faultHistoryA },
      faultHistoryB: { ...this.faultHistoryB },
      isSuddenDeath: this.isSuddenDeath,
      overtimeType: this.overtimeType,
      waitingOvertimeStart: this.waitingOvertimeStart,
      waitingCoinFlip: this.waitingCoinFlip,
    };
    this.actionHistory.push(snapshot);
    if (this.actionHistory.length > 20) this.actionHistory.shift(); // 20 dernières actions (#1808)
    document.getElementById('btn-undo').disabled = false;
  }

  callDT() {
    const btn = document.getElementById('btn-dt-icon');
    if (!btn || btn.classList.contains('dt-active') || btn.classList.contains('dt-ack')) return;
    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    btn.classList.add('dt-active');
    this.socket.emit('arena_control', { arenaId: this.arenaId, action: 'dt_call' });
    this.showNotification(window.T('referee.dt_called'));
  }

  cancelDTCall() {
    const btn = document.getElementById('btn-dt-icon');
    if (!btn || (!btn.classList.contains('dt-active') && !btn.classList.contains('dt-ack'))) return;
    this._resetDTButton();
    this.socket.emit('arena_control', { arenaId: this.arenaId, action: 'dt_cancel' });
    this.showNotification(window.T('referee.dt_call_cancelled'));
  }

  _resetDTButton() {
    const btn = document.getElementById('btn-dt-icon');
    if (!btn) return;
    btn.classList.remove('dt-active', 'dt-ack');
  }

  undoLastAction() {
    if (this.actionHistory.length === 0) return;
    if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
    const prev = this.actionHistory.pop();
    this.scoreA = prev.scoreA;
    this.scoreB = prev.scoreB;
    this.cardsA = prev.cardsA;
    this.cardsB = prev.cardsB;
    this.faultHistoryA = prev.faultHistoryA;
    this.faultHistoryB = prev.faultHistoryB;
    this.isSuddenDeath = prev.isSuddenDeath;
    this.overtimeType = prev.overtimeType;
    this.waitingOvertimeStart = prev.waitingOvertimeStart ?? false;
    this.waitingCoinFlip = prev.waitingCoinFlip ?? false;
    this.updateScores();
    this.updateCardsDisplay();
    this.updateSuddenDeathUI();
    this.updateControlButtons();
    this.broadcastUpdate();
    this.saveScore();
    this.showNotification(window.T('referee.action_undone'));
    document.getElementById('btn-undo').disabled = this.actionHistory.length === 0;
  }

  // ── Mort subite ───────────────────────────────────────────────────────

  triggerSuddenDeathChallenger() {
    this.isSuddenDeath = true;
    // Si on est déjà en temps supplémentaire, on combine les deux états
    this.overtimeType =
      this.overtimeType === 'supplementary' ? 'challenger_supplementary' : 'challenger';
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    this.updateSuddenDeathUI();
    this.showNotification(window.T('referee.sd_both_10'));
  }

  // Afficher les labels selon l'état courant
  updateSuddenDeathUI() {
    const sdLabel = document.getElementById('sudden-death-label');
    const msLabel = document.getElementById('mort-subite-label');

    const isSupplementary =
      this.isSuddenDeath &&
      (this.overtimeType === 'supplementary' || this.overtimeType === 'challenger_supplementary');
    const isChallengerSD =
      this.isSuddenDeath &&
      (this.overtimeType === 'challenger' || this.overtimeType === 'challenger_supplementary');

    if (sdLabel) {
      sdLabel.style.display = isSupplementary ? 'block' : 'none';
      if (this.isModernFencing) sdLabel.textContent = window.T('arena.supplementary_1min');
    }
    if (msLabel) {
      msLabel.style.display = isChallengerSD ? 'block' : 'none';
    }
  }

  // ── Sortie d'arène ────────────────────────────────────────────────────

  arenaExit(fencer) {
    if (!this.currentMatch) return;
    if (this.matchStatus === 'not_started') return;
    if (this.matchStatus === 'finished') return;

    this.pushHistory('arena_exit');
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    const ef = this._effectiveFencer(fencer);
    // Escrime olympique : une seule touche ; Sabre Laser : 3 points (#1027)
    const points = this.isModernFencing ? 1 : 3;
    if (ef === 'A') {
      this.scoreB += points;
    } else {
      this.scoreA += points;
    }
    this.updateScores();
    this.broadcastUpdate();
    this.saveScore();
    this.socket.emit('arena_control', {
      arenaId: this.arenaId,
      action: 'arena_exit',
      fencer: ef,
      isVoluntary: false,
    });
    // label = couleur affichée pour le tireur qui a quitté la piste
    const exitColor =
      fencer === 'A' ? (this.swapped ? 'Vert' : 'Rouge') : this.swapped ? 'Rouge' : 'Vert';
    this.showNotification(window.T('referee.arena_exit_notif', { label: exitColor, points }));
    if (this.cardAnnounceEnabled) {
      const nameEl = document.getElementById(`fencer-${fencer.toLowerCase()}-name`);
      const fencerName = nameEl ? nameEl.textContent.trim() : exitColor;
      this.socket.emit('arena_control', {
        arenaId: this.arenaId,
        action: 'exit_announcement',
        announcement: { fencer: ef, fencerName, points },
      });
    }
  }
}
