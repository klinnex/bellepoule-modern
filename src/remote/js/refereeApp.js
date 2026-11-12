/**
 * BellePoule Modern - Tablette arbitre : classe RefereeApp (2e moitié : saisie des touches, cartons, listes, signatures).
 * Extrait de referee.html (#1600). Hérite de RefereeAppBase (/js/refereeAppBase.js, chargé avant).
 * Script classique chargé en <script src="/js/refereeApp.js"> (CSP : pas de script inline).
 * Licensed under GPL-3.0
 */
/* global BPRefereeControls, BPRefereeLists, BPRefereeScoring, BPRefereeTimer, BPRefereeTts, BPRefereeUpdate, PASSIVITY_CARDS, RefereeAppBase, applyScreenTheme, bpCssVar, bpIcon, escHtml, isStandardCard, lastIndexWhere */
/* exported openJournal, reloadIfIdle */
class RefereeApp extends RefereeAppBase {
  // Retirer des points (appui long)
  removeScore(fencer, points) {
    if (!this.currentMatch) return;
    if (this.matchStatus === 'not_started') return;
    if (this.matchStatus === 'finished') return;

    if (navigator.vibrate) navigator.vibrate(30);
    const ef = this._effectiveFencer(fencer);
    const zone = this.zoneLetter(points);
    if (ef === 'A') {
      this.scoreA = Math.max(0, this.scoreA - points);
      const idx = this.touchesA.lastIndexOf(zone);
      if (idx !== -1) this.touchesA.splice(idx, 1);
    } else {
      this.scoreB = Math.max(0, this.scoreB - points);
      const idx = this.touchesB.lastIndexOf(zone);
      if (idx !== -1) this.touchesB.splice(idx, 1);
    }

    // Ré-évaluer la mort subite : si un score repasse sous 10, on quitte la mort subite challenger
    const exit = BPRefereeScoring.challengerExit(this);
    if (exit) {
      this.overtimeType = exit.overtimeType;
      this.isSuddenDeath = exit.isSuddenDeath;
      this.updateSuddenDeathUI();
    }

    this.updateScores();
    this.broadcastUpdate();
    this.saveScore();
    this.showNotification(
      window.T(points > 1 ? 'referee.points_removed' : 'referee.point_removed', { n: points })
    );
  }

  // Appui long sur un bouton carton : P retire un carton de passivité (escrime olympique)
  removeCardFromButton(config) {
    if (this.isModernFencing && config.cardType === 'white') this.removeLastPassivityCard();
    else this.removeLastCard(config.fencer);
  }

  // Retirer le dernier carton (appui long sur n'importe quel bouton carton)
  removeLastCard(fencer) {
    if (!this.currentMatch) return;
    if (this.matchStatus === 'not_started') return;
    if (this.matchStatus === 'finished') return;

    const ef = this._effectiveFencer(fencer);
    const cards = ef === 'A' ? this.cardsA : this.cardsB;
    const history = ef === 'A' ? this.faultHistoryA : this.faultHistoryB;

    // Les cartons de passivité sont hors cumul : ignorés ici (#1026)
    const lastIdx = lastIndexWhere(cards, isStandardCard);
    if (lastIdx === -1) {
      this.showNotification(window.T('referee.no_card_to_remove'));
      return;
    }

    if (navigator.vibrate) navigator.vibrate(30);
    const [lastCard] = cards.splice(lastIdx, 1);

    // Restituer les points accordés à l'adversaire
    if (this.isModernFencing) {
      if (lastCard === 'red') {
        if (ef === 'A') this.scoreB = Math.max(0, this.scoreB - 1);
        else this.scoreA = Math.max(0, this.scoreA - 1);
      }
    } else if (lastCard === 'yellow') {
      if (ef === 'A') this.scoreB = Math.max(0, this.scoreB - 3);
      else this.scoreA = Math.max(0, this.scoreA - 3);
    } else if (lastCard === 'red') {
      if (ef === 'A') this.scoreB = Math.max(0, this.scoreB - 5);
      else this.scoreA = Math.max(0, this.scoreA - 5);
    }

    // Décrémenter l'historique des fautes (meilleure approximation par type)
    if (lastCard === 'white' && history[1] > 0) {
      history[1]--;
    } else if (lastCard === 'yellow') {
      if (history[2] > 0) history[2]--;
      else if (history[1] > 0) history[1]--;
    } else if (lastCard === 'red') {
      if (history[3] > 0) history[3]--;
      else if (history[2] > 0) history[2]--;
    }

    // Ré-évaluer la mort subite
    if (
      this.isSuddenDeath &&
      this.isLaserSabre &&
      (this.overtimeType === 'challenger' || this.overtimeType === 'challenger_supplementary')
    ) {
      if (!(this.scoreA >= 10 && this.scoreB >= 10)) {
        this.overtimeType =
          this.overtimeType === 'challenger_supplementary' ? 'supplementary' : null;
        if (this.overtimeType === null) this.isSuddenDeath = false;
        this.updateSuddenDeathUI();
      }
    }

    this.updateScores();
    this.updateCardsDisplay();
    this.broadcastUpdate();
    this.saveScore();
    const undoKey =
      lastCard === 'white'
        ? 'referee.undo_white'
        : lastCard === 'yellow'
          ? 'referee.undo_yellow'
          : 'referee.undo_red';
    this.showNotification(window.T(undoKey));
  }

  toggleColorblind(force) {
    const on = typeof force === 'boolean' ? force : !document.body.classList.contains('colorblind');
    document.body.classList.toggle('colorblind', on);
    document.getElementById('btn-colorblind')?.classList.toggle('active', on);
    try {
      localStorage.setItem('bp_colorblind', on ? '1' : '0');
    } catch (_) {
      /* stockage indisponible */
    }
  }

  toggleSwap() {
    this.swapped = !this.swapped;
    this.applySwapState();
  }

  _effectiveFencer(configFencer) {
    return this.swapped ? configFencer : configFencer === 'A' ? 'B' : 'A';
  }

  applySwapState() {
    const boxA = document.getElementById('fencer-a-box');
    const boxB = document.getElementById('fencer-b-box');
    if (boxA) boxA.className = `fencer-box ${this.swapped ? 'green-side' : 'red-side'}`;
    if (boxB) boxB.className = `fencer-box ${this.swapped ? 'red-side' : 'green-side'}`;
    const scoreA = document.getElementById('score-a');
    const scoreB = document.getElementById('score-b');
    if (scoreA) scoreA.className = `score-display ${this.swapped ? 'green-score' : 'red-score'}`;
    if (scoreB) scoreB.className = `score-display ${this.swapped ? 'red-score' : 'green-score'}`;

    if (this.currentMatch) {
      const left = this.swapped ? this.currentMatch.fencerA : this.currentMatch.fencerB;
      const right = this.swapped ? this.currentMatch.fencerB : this.currentMatch.fencerA;
      const leftName = `${left?.lastName || ''} ${left?.firstName || ''}`.trim();
      const rightName = `${right?.lastName || ''} ${right?.firstName || ''}`.trim();
      const nameElA = document.getElementById('fencer-a-name');
      const clubElA = document.getElementById('fencer-a-club');
      const nameElB = document.getElementById('fencer-b-name');
      const clubElB = document.getElementById('fencer-b-club');
      if (nameElA) {
        nameElA.textContent = leftName;
        nameElA.title = leftName;
      }
      if (clubElA) {
        clubElA.textContent = left?.club || '';
        clubElA.title = left?.club || '';
      }
      if (nameElB) {
        nameElB.textContent = rightName;
        nameElB.title = rightName;
      }
      if (clubElB) {
        clubElB.textContent = right?.club || '';
        clubElB.title = right?.club || '';
      }
    }

    document.getElementById('btn-swap')?.classList.toggle('active', this.swapped);
    if (this._prioSide) this.applyPriorityFrame(this._prioSide); // cadre doré suit l'inversion (#1442)
    this.updateScores();
    this.updateCardsDisplay();
  }

  updateScores() {
    const scoreAEl = document.getElementById('score-a');
    const scoreBEl = document.getElementById('score-b');
    if (this.matchStatus === 'not_started') {
      scoreAEl.textContent = '–';
      scoreBEl.textContent = '–';
      scoreAEl.classList.add('not-started');
      scoreBEl.classList.add('not-started');
    } else {
      scoreAEl.textContent = this.swapped ? this.scoreA : this.scoreB;
      scoreBEl.textContent = this.swapped ? this.scoreB : this.scoreA;
      scoreAEl.classList.remove('not-started');
      scoreBEl.classList.remove('not-started');
    }
    if (this.waitingCoinFlip) this.updateControlButtons();
  }

  updateCardsDisplay() {
    const renderCards = cards =>
      cards
        .map(
          card =>
            `<div class="card card-${escHtml(card)}">${PASSIVITY_CARDS.includes(card) ? 'P' : card === 'white' ? 'B' : card === 'yellow' ? 'J' : card === 'black' ? 'N' : 'R'}</div>`
        )
        .join('');

    document.getElementById('fencer-a-cards').innerHTML = renderCards(
      this.swapped ? this.cardsA : this.cardsB
    );
    document.getElementById('fencer-b-cards').innerHTML = renderCards(
      this.swapped ? this.cardsB : this.cardsA
    );
  }

  toggleTimer() {
    if (this.timerRunning) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  }

  updateBackButton() {
    const btn = document.getElementById('btn-back-to-list');
    if (!btn) return;
    const busy = this.timerRunning;
    btn.disabled = busy;
    btn.style.opacity = busy ? '0.4' : '1';
    btn.style.cursor = busy ? 'not-allowed' : 'pointer';
    btn.title = busy ? 'Retour désactivé pendant le chrono' : 'Retour à la liste des matchs';
  }

  startTimer() {
    if (this.timerRunning) return;

    this.timerRunning = true;
    this.updateBackButton();
    this.updateTimerDisplay();
    this.broadcastTimerUpdate();

    this._ttsAnnouncedSeconds = new Set();
    const endAt = Date.now() + this._timerCs * 10;
    let lastTenth = Math.floor(this._timerCs / 10); // tick 10 ms sans dérive (#1416)
    this.timerInterval = setInterval(() => {
      if (this._timerCs <= 0) return;
      const t = BPRefereeTimer.timerTick(endAt, Date.now(), this._timerCs, lastTenth);
      this._timerCs = t.cs;
      lastTenth = t.lastTenth;
      if (t.fullRender) this.updateTimerDisplay();
      else
        window.BPTimer.renderTimer(document.getElementById('timer-display'), this._timerCs / 100, {
          alwaysTenths: true,
        });
      if (t.broadcast) this.broadcastTimerUpdate();
      if (t.announce) this.ttsCheckAnnounce();
      if (!t.finished) return;

      this.stopTimer();
      if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
      switch (BPRefereeTimer.timeUpAction(this)) {
        case 'endRest':
          this.endRest();
          break;
        case 'priorityDraw': // minute prioritaire tirée AVANT la minute supplémentaire (#1442)
          this.priorityDrawPhase = true;
          this.prepareCoinFlip();
          break;
        case 'suddenDeath': // égalité : attente manuelle de l'arbitre pour le temps supplémentaire
          this.prepareSuddenDeath();
          break;
        case 'priorityApplies':
          this.showNotification(window.T('referee.priority_applies'));
          break;
        case 'coinFlip': // fin du temps supplémentaire avec égalité (#1136)
          this.prepareCoinFlip();
          break;
        default:
          this.showNotification(window.T('referee.time_up'));
      }
    }, 10);
  }

  // Repos (escrime olympique) : chrono à 00:00, met le temps de repos sans fin de match (#1134)
  canStartRest() {
    return BPRefereeControls.canStartRest({
      isModernFencing: this.isModernFencing,
      restSeconds: this.restSeconds,
      hasMatch: !!this.currentMatch,
      matchStatus: this.matchStatus,
      timerSeconds: this.timerSeconds,
      timerRunning: this.timerRunning,
      isResting: this.isResting,
    });
  }

  updateRestButton() {
    const btn = document.getElementById('btn-rest');
    if (!btn) return;
    btn.style.display = this.isModernFencing && this.restSeconds > 0 ? '' : 'none';
    btn.disabled = !this.canStartRest();
    btn.classList.toggle('active', this.isResting);
  }

  startRest() {
    if (!this.canStartRest()) return;
    this.waitingOvertimeStart = false;
    this.waitingCoinFlip = false;
    this.isResting = true;
    this.timerSeconds = this.restSeconds;
    this.updateControlButtons();
    this.startTimer();
    this.showNotification(window.T('referee.rest_notif'));
  }

  // Fin du repos : le chrono retrouve sa durée initiale, le match continue
  endRest() {
    this.isResting = false;
    this.timerSeconds = this.defaultTimerSeconds;
    this.updateTimerDisplay();
    this.broadcastTimerUpdate();
    this.updateControlButtons();
    this.showNotification(window.T('referee.rest_end'));
  }

  pauseTimer() {
    this.stopTimer();
    this.updateTimerDisplay();
    this.broadcastTimerUpdate();
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerRunning = false;
    this.updateBackButton();
    this.updateRestButton();
  }

  resetTimer() {
    this.stopTimer();
    this.isSuddenDeath = false;
    this.waitingOvertimeStart = false;
    this.waitingCoinFlip = false;
    this.isResting = false;
    this.overtimeType = null;
    this.timerSeconds = this.defaultTimerSeconds;
    this._ttsAnnouncedSeconds = new Set();
    this.updateTimerDisplay();
    this.broadcastTimerUpdate();
    this.updateSuddenDeathUI();
    this.updateControlButtons();
    this.showNotification(window.T('referee.timer_reset'));
  }

  toggleTTS() {
    this.ttsEnabled = !this.ttsEnabled;
    const btn = document.getElementById('btn-tts-toggle');
    if (btn) {
      const on = this.ttsEnabled;
      btn.innerHTML =
        bpIcon(on ? 'volume-on' : 'volume-off') +
        ' ' +
        escHtml(window.T(on ? 'referee.voice_on' : 'referee.voice_off'));
    }
    if (this.ttsEnabled) this.ttsSpeak(BPRefereeTts.enabledMessage(this.ttsLangCode()));
  }

  // Fusionne une config TTS partielle reçue du serveur dans la config locale
  applyTtsConfig(c) {
    BPRefereeTts.mergeTtsConfig(this.ttsConfig, c);
  }

  // Code de langue normalisé pour le TTS (/js/refereeTts.js)
  ttsLangCode() {
    return BPRefereeTts.ttsLangCode(document.documentElement.lang);
  }

  // Balise BCP-47 pour SpeechSynthesisUtterance.lang
  ttsBcp47(code) {
    return BPRefereeTts.ttsBcp47(code);
  }

  ttsSpeak(text) {
    if (!this.ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = this.ttsBcp47(this.ttsLangCode());
    // Voix choisie dans les paramètres globaux (sinon voix par défaut de la langue)
    const wanted = this.ttsConfig.voiceName;
    if (wanted && window.speechSynthesis.getVoices) {
      const v = window.speechSynthesis.getVoices().find(x => x.name === wanted);
      if (v) {
        utt.voice = v;
        utt.lang = v.lang;
      }
    }
    utt.rate = this.ttsConfig.rate || 1.1;
    utt.volume = 1.0;
    window.speechSynthesis.speak(utt);
  }

  ttsCheckAnnounce() {
    if (!this.ttsEnabled) return;
    const s = this.timerSeconds;
    if (this._ttsAnnouncedSeconds.has(s)) return;
    const ann = BPRefereeTts.announcementFor(s, this.ttsLangCode(), this.ttsConfig.announce);
    if (!ann) return;
    this._ttsAnnouncedSeconds.add(s);
    if (ann.text) this.ttsSpeak(ann.text);
  }

  prepareSuddenDeath() {
    this.waitingOvertimeStart = true;
    this.updateControlButtons();
    this.socket.emit('arena_control', {
      arenaId: this.arenaId,
      action: 'waiting_overtime',
      time: 0,
      timerStatus: 'paused',
    });
    this.showNotification(window.T('referee.tie_launch', { label: this.overtimeLabel() }));
  }

  // Durée du temps supplémentaire : 1 min en escrime olympique, 30 s au Sabre Laser (#1027)
  overtimeSeconds() {
    return this.isModernFencing ? 60 : 30;
  }

  overtimeLabel() {
    return this.isModernFencing ? '1 min' : '30s';
  }

  launchSuddenDeath() {
    this.waitingOvertimeStart = false;
    this.waitingCoinFlip = false;
    this.isResting = false;
    this.triggerSuddenDeath();
  }

  triggerSuddenDeath() {
    this.isSuddenDeath = true;
    // Si déjà en mode challenger (Sabre Laser 10-10), conserver la contrainte Zone C
    if (this.overtimeType === 'challenger') {
      this.overtimeType = 'challenger_supplementary';
    } else {
      this.overtimeType = 'supplementary';
    }
    if (navigator.vibrate) navigator.vibrate([150, 80, 150, 80, 400]);
    this.timerSeconds = this.overtimeSeconds();
    this.updateTimerDisplay();
    this.broadcastTimerUpdate();
    this.updateSuddenDeathUI();
    const msg =
      this.overtimeType === 'challenger_supplementary'
        ? window.T('referee.ot_challenger')
        : this.isModernFencing
          ? window.T('referee.ot_modern')
          : window.T('referee.ot_laser');
    this.showNotification(msg);
    this.startTimer();
  }

  applyPriorityFrame(side) {
    this._prioSide = side; // côté logique, repeint si l'inversion change
    window.BPPriorityDraw.paintPriorityFrame(document, side, this.swapped);
  }

  // Attente du tirage au sort : l'arbitre peut corriger le score avant de le lancer (#1136)
  prepareCoinFlip() {
    this.waitingCoinFlip = true;
    this.updateControlButtons();
    this.showNotification(window.T('referee.tie_coin'));
  }

  triggerTiebreaker() {
    this.waitingCoinFlip = false;
    this.updateControlButtons();
    const winner = Math.random() < 0.5 ? 'A' : 'B';
    if (this.priorityDrawPhase) return this.startPriorityDraw(winner); // minute prioritaire (#1442)
    this.coinFlipWinner = winner;

    // Déclencher l'animation plein écran sur l'affichage de score
    this.socket.emit('arena_control', {
      arenaId: this.arenaId,
      action: 'coin_flip',
      winner,
    });

    this.showNotification(window.T('referee.coin_anim'));

    // Afficher la confirmation sur la tablette après la fin de l'animation
    setTimeout(() => this.showCoinFlipConfirm(winner), 4500);
  }

  showCoinFlipConfirm(winner) {
    const winnerFencer = winner === 'A' ? this.currentMatch?.fencerA : this.currentMatch?.fencerB;
    const winnerName = winnerFencer
      ? `${winnerFencer.lastName || ''} ${winnerFencer.firstName || ''}`.trim() ||
        window.T('referee.fencer_default', { pos: winner })
      : window.T('referee.fencer_default', { pos: winner });
    // fencerA est toujours côté VERT (logical), fencerB toujours ROUGE
    const colorLabel = window.T(winner === 'A' ? 'arena.coin_green' : 'arena.coin_red');

    const nameDisplay = document.getElementById('coin-flip-confirm-name');
    const colorDisplay = document.getElementById('coin-flip-confirm-color');
    if (nameDisplay) {
      nameDisplay.textContent = winnerName;
      nameDisplay.className = `coin-flip-confirm-winner ${winner === 'A' ? 'winner-green' : 'winner-red'}`;
    }
    if (colorDisplay) colorDisplay.textContent = `(${colorLabel})`;

    const overlay = document.getElementById('coin-flip-confirm');
    if (overlay) overlay.classList.add('active');
  }

  confirmCoinFlipFinish() {
    const overlay = document.getElementById('coin-flip-confirm');
    if (overlay) overlay.classList.remove('active');
    if (this.coinFlipWinner) {
      this.confirmFinishWithCoinFlip(this.coinFlipWinner);
    }
  }

  async confirmFinishWithCoinFlip(winner, reasonLabel = window.T('referee.reason_coin')) {
    if (!this.currentMatch) return;

    const fencer = winner === 'A' ? this.currentMatch.fencerA : this.currentMatch.fencerB;
    const winnerName = fencer
      ? `${fencer.lastName || ''} ${fencer.firstName || ''}`.trim() ||
        window.T('referee.fencer_default', { pos: winner })
      : window.T('referee.fencer_default', { pos: winner });
    this.showNotification(window.T('referee.wins', { name: winnerName, reason: reasonLabel }));

    this.isSuddenDeath = false;
    this.waitingOvertimeStart = false;
    this.waitingCoinFlip = false;
    this.isResting = false;
    this.overtimeType = null;
    this.updateSuddenDeathUI();
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
          winner,
          cardsA: this.cardsA,
          cardsB: this.cardsB,
        }),
      });

      this.updateControlButtons();
      this.socket.emit('arena_control', { arenaId: this.arenaId, action: 'finish' });

      setTimeout(() => {
        this.currentMatch = null;
        this.scoreA = 0;
        this.scoreB = 0;
        this.cardsA = [];
        this.cardsB = [];
        this.touchesA = [];
        this.touchesB = [];
        this.faultHistoryA = { 1: 0, 2: 0, 3: 0 };
        this.faultHistoryB = { 1: 0, 2: 0, 3: 0 };
        this.coinFlipWinner = null;
        this.matchStatus = 'not_started';
        this.timerSeconds = this.defaultTimerSeconds;
        this.updateTimerDisplay();
        document.getElementById('active-match').classList.remove('visible');
        this.showNextMatchesScreen();
      }, 2000);
    } catch (error) {
      console.error('Erreur fin de match (tirage au sort):', error);
      this.showNotification(window.T('referee.error_save'), true);
    }
  }

  updateTimerDisplay() {
    const timerEl = document.getElementById('timer-display');
    window.BPTimer.renderTimer(timerEl, this._timerCs / 100, { alwaysTenths: true });
    // Classes visuelles
    timerEl.className = BPRefereeControls.timerClasses({
      timerRunning: this.timerRunning,
      timerSeconds: this.timerSeconds,
      defaultTimerSeconds: this.defaultTimerSeconds,
    }).join(' ');

    // Affichage mort subite (synchronise label + état boutons)
    this.updateSuddenDeathUI();
    this.updateRestButton();
  }

  broadcastTimerUpdate() {
    this.persistTimerState();
    this.socket.emit('arena_control', {
      arenaId: this.arenaId,
      action: this.timerRunning ? 'update_timer' : 'pause_timer',
      time: this._timerCs / 100,
      timerStatus: this.timerRunning ? 'running' : 'paused',
      suddenDeath: this.isSuddenDeath,
      overtimeType: this.overtimeType,
    });
  }

  // Stockage local du chrono (#1717) : null si indisponible (navigation privée stricte)
  _timerStorage() {
    try {
      return window.localStorage;
    } catch (e) {
      return null;
    }
  }

  // Mémorise le chrono du match en cours pour le restaurer après un rafraîchissement (#1717)
  persistTimerState() {
    if (!this.currentMatch || this.matchStatus !== 'in_progress') return;
    const storage = this._timerStorage();
    if (!storage) return;
    BPRefereeTimer.saveTimerState(
      storage,
      this.arenaId,
      {
        matchId: this.currentMatch.id,
        cs: this._timerCs,
        isSuddenDeath: this.isSuddenDeath,
        overtimeType: this.overtimeType,
        isResting: this.isResting,
      },
      Date.now()
    );
  }

  broadcastUpdate() {
    this.socket.emit('arena_control', {
      arenaId: this.arenaId,
      action: 'update_score',
      scoreA: this.scoreA,
      scoreB: this.scoreB,
      cardsA: this.cardsA,
      cardsB: this.cardsB,
      touchesA: this.touchesA,
      touchesB: this.touchesB,
      suddenDeath: this.isSuddenDeath,
      overtimeType: this.overtimeType,
    });
  }

  async saveScore() {
    if (!this.currentMatch) return;

    const payload = {
      matchId: this.currentMatch.id,
      scoreA: this.scoreA,
      scoreB: this.scoreB,
      status: this.matchStatus,
    };

    if (!navigator.onLine) {
      await this.offlineQueue.addAction('score_save', payload).catch(() => {});
      this.updateOfflineBadge();
      return;
    }

    try {
      const resp = await fetch(`/api/matches/${this.currentMatch.id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scoreA: this.scoreA,
          scoreB: this.scoreB,
          status: this.matchStatus,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    } catch (error) {
      console.error('Erreur sauvegarde — mise en file hors-ligne:', error);
      await this.offlineQueue.addAction('score_save', payload).catch(() => {});
      this.updateOfflineBadge();
    }
  }

  startMatch() {
    if (!this.currentMatch) return;

    if (navigator.vibrate) navigator.vibrate([30, 20, 30, 20, 80]);
    this.matchStatus = 'in_progress';
    this.startTimer();
    this.updateScores();
    this.updateMatchStatus();
    this.updateControlButtons();
    this.saveScore();

    this.socket.emit('arena_control', {
      arenaId: this.arenaId,
      action: 'start',
    });

    this.showNotification(window.T('referee.match_started'));
  }

  showFinishModal() {
    if (!this.currentMatch || this.matchStatus !== 'in_progress') return;

    if (navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 600]);

    if (this.timerRunning) {
      this.pauseTimer();
      this.pausedForModal = true;
    }

    document.getElementById('final-score-display').textContent = this.swapped
      ? `${this.scoreA} - ${this.scoreB}`
      : `${this.scoreB} - ${this.scoreA}`;
    document.getElementById('finish-modal').classList.add('active');
  }

  hideFinishModal() {
    document.getElementById('finish-modal').classList.remove('active');
    if (this.pausedForModal && this.matchStatus !== 'finished') {
      this.startTimer();
    }
    this.pausedForModal = false;
  }

  async confirmFinish() {
    if (!this.currentMatch) return;

    // Conserver les infos du match avant réinitialisation (pour la signature)
    const finishedMatch = this.currentMatch;

    this.matchStatus = 'finished';
    this._clearStoredTimer();
    this.stopTimer();
    this.hideFinishModal();

    try {
      const resp = await fetch(`/api/matches/${this.currentMatch.id}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scoreA: this.scoreA,
          scoreB: this.scoreB,
          cardsA: this.cardsA,
          cardsB: this.cardsB,
          winner: this.scoreA === this.scoreB ? this.priorityWinnerSide() : undefined, // prioritaire gagne (#1442)
        }),
      });
      const result = await resp.json().catch(() => ({}));

      this.updateMatchStatus();
      this.updateControlButtons();

      this.socket.emit('arena_control', {
        arenaId: this.arenaId,
        action: 'finish',
      });

      this.showNotification(window.T('referee.match_saved'));

      // Signature requise sur tablette après un match du tableau
      if (result.requireSignature && finishedMatch.fencerA?.id && finishedMatch.fencerB?.id) {
        this.openMatchSignature(finishedMatch, this.scoreA, this.scoreB, result.winner);
      }

      // Afficher l'écran des prochains matchs
      setTimeout(() => {
        this.currentMatch = null;
        this.scoreA = 0;
        this.scoreB = 0;
        this.cardsA = [];
        this.cardsB = [];
        this.touchesA = [];
        this.touchesB = [];
        this.faultHistoryA = { 1: 0, 2: 0, 3: 0 };
        this.faultHistoryB = { 1: 0, 2: 0, 3: 0 };
        this.matchStatus = 'not_started';
        this.timerSeconds = this.defaultTimerSeconds;
        this.isSuddenDeath = false;
        this.waitingOvertimeStart = false;
        this.waitingCoinFlip = false;
        this.isResting = false;
        this.overtimeType = null;
        this.updateTimerDisplay();
        document.getElementById('active-match').classList.remove('visible');
        this.showNextMatchesScreen();
      }, 2000);
    } catch (error) {
      console.error('Erreur fin de match:', error);
      this.showNotification(window.T('referee.error_save'), true);
    }
  }

  // ── Signature des combattants après un match du tableau ──
  openMatchSignature(match, scoreA, scoreB, winner) {
    this.signMatch = match;
    const overlay = document.getElementById('match-sig-overlay');
    const fullName = f => `${(f.lastName || '').toUpperCase()} ${f.firstName || ''}`.trim();
    const aWins = scoreA > scoreB || (scoreA === scoreB && winner === 'A'); // égalité : prioritaire (#1442)
    const bWins = scoreB > scoreA || (scoreA === scoreB && winner === 'B');
    // Rappel du score et indication du vainqueur (V)
    document.getElementById('match-sig-score').textContent = `${scoreA} – ${scoreB}`;
    const vTag = win => (win ? '<span class="match-sig-victory">V</span> ' : '');
    document.getElementById('match-sig-name-a').innerHTML =
      /* html */ vTag(aWins) + escHtml(fullName(match.fencerA));
    document.getElementById('match-sig-name-b').innerHTML =
      /* html */ vTag(bWins) + escHtml(fullName(match.fencerB));
    document.getElementById('match-sig-pad-a').classList.toggle('winner', aWins);
    document.getElementById('match-sig-pad-b').classList.toggle('winner', bWins);
    overlay.classList.add('visible');
    this._setupSigCanvas('match-sig-canvas-a');
    this._setupSigCanvas('match-sig-canvas-b');
  }

  _setupSigCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = bpCssVar('--slate-800');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.clearRect(0, 0, rect.width, rect.height);
    canvas._hasInk = false;

    if (canvas._sigBound) return;
    canvas._sigBound = true;
    let drawing = false;
    const pos = e => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.addEventListener('pointerdown', e => {
      drawing = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!drawing) return;
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      canvas._hasInk = true;
    });
    canvas.addEventListener('pointerup', () => {
      drawing = false;
    });
    canvas.addEventListener('pointercancel', () => {
      drawing = false;
    });
  }

  clearMatchSig(slot) {
    const canvas = document.getElementById(`match-sig-canvas-${slot}`);
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    canvas._hasInk = false;
  }

  closeMatchSignature() {
    document.getElementById('match-sig-overlay').classList.remove('visible');
    this.signMatch = null;
  }

  async submitMatchSignatures() {
    const match = this.signMatch;
    if (!match) return;
    const canvasA = document.getElementById('match-sig-canvas-a');
    const canvasB = document.getElementById('match-sig-canvas-b');
    if (!canvasA._hasInk || !canvasB._hasInk) {
      this.showNotification(window.T('referee.both_sign'), true);
      return;
    }
    const btn = document.getElementById('match-sig-submit');
    btn.disabled = true;
    try {
      const send = async (fencerId, dataURL) => {
        const resp = await fetch(`/api/matches/${match.id}/fencers/${fencerId}/signature`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signatureData: dataURL }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      };
      await Promise.all([
        send(match.fencerA.id, canvasA.toDataURL('image/png')),
        send(match.fencerB.id, canvasB.toDataURL('image/png')),
      ]);
      this.showNotification(window.T('referee.sigs_saved'));
      this.closeMatchSignature();
    } catch (e) {
      console.error('Erreur signatures match:', e);
      this.showNotification(window.T('referee.error_save'), true);
    } finally {
      btn.disabled = false;
    }
  }

  updateMatchStatus() {
    // Cadre doré du tireur prioritaire effacé dès que le match change (#1442)
    if (
      this._prioFencerId &&
      ![this.currentMatch?.fencerA?.id, this.currentMatch?.fencerB?.id].includes(this._prioFencerId)
    ) {
      this._prioFencerId = null;
      this.applyPriorityFrame(null);
    }
    // badge supprimé — statut visible via boutons de contrôle et chronomètre
  }

  updateControlButtons() {
    const startBtn = document.getElementById('btn-start');
    const finishBtn = document.getElementById('btn-finish');
    const st = BPRefereeControls.controlButtonsState({
      priorityAnimating: this._priorityAnimating,
      waitingOvertimeStart: this.waitingOvertimeStart,
      waitingCoinFlip: this.waitingCoinFlip,
      scoreA: this.scoreA,
      scoreB: this.scoreB,
      matchStatus: this.matchStatus,
      hasMatch: !!this.currentMatch,
      timerRunning: this.timerRunning,
      overtimeLabel: this.waitingOvertimeStart ? this.overtimeLabel() : '',
    });
    if (st.lockAll) return void [startBtn, finishBtn].forEach(b => b && (b.disabled = true));

    startBtn.disabled = st.start.disabled;
    startBtn.innerHTML =
      bpIcon(st.start.icon) + ' ' + escHtml(window.T(st.start.key, st.start.params));
    startBtn.className = st.start.className;
    if (finishBtn) finishBtn.disabled = st.finishDisabled;
    if (st.updateScoreButtons) this.updateScoreButtons();
    if (st.updateRestButton) this.updateRestButton();
  }

  updateScoreButtons() {
    const locked = BPRefereeControls.scoreButtonsLocked(this.matchStatus);
    document.querySelectorAll('.score-btn, .card-btn').forEach(btn => {
      btn.disabled = locked;
    });
  }

  handleStartPauseClick() {
    if (this._priorityAnimating) return;
    if (this.waitingOvertimeStart) {
      this.launchSuddenDeath();
      return;
    }
    if (this.waitingCoinFlip && this.scoreA === this.scoreB) {
      this.triggerTiebreaker();
      return;
    }
    if (this.matchStatus === 'not_started') {
      this.startMatch();
    } else if (this.matchStatus === 'in_progress') {
      this.toggleMatchPause();
    }
  }

  toggleMatchPause() {
    if (!this.currentMatch || this.matchStatus !== 'in_progress') return;

    if (this.timerRunning) {
      this.pauseTimer();
      if (navigator.vibrate) navigator.vibrate(30);
      this.updateControlButtons();
      this.showNotification(window.T('referee.match_paused'));
    } else {
      this.startTimer();
      if (navigator.vibrate) navigator.vibrate(30);
      this.updateControlButtons();
      this.showNotification(window.T('referee.match_resumed'));
    }
  }

  handleArenaUpdate(data) {
    if (data.screenThemes?.referee) {
      applyScreenTheme(data.screenThemes.referee.variables);
    }
    if (BPRefereeUpdate.shouldReloadForRules(this, data)) return window.location.reload(); // règles changées en propriétés (#1118)

    if (data.timerDuration !== undefined && data.timerDuration > 0) {
      this.defaultTimerSeconds = data.timerDuration;
    }
    if (typeof data.restSeconds === 'number') {
      this.restSeconds = Math.max(0, data.restSeconds);
      this.updateRestButton();
    }

    if (data.trainingCustomRules !== undefined) {
      this.trainingCustomRules = data.trainingCustomRules;
    }

    if (data.cardAnnounce !== undefined) {
      this.cardAnnounceEnabled = data.cardAnnounce;
    }

    if (data.refereeFeatureEnabled !== undefined) {
      this.refereeFeatureEnabled = data.refereeFeatureEnabled;
    }
    if (data.blackCardEnabled !== undefined) {
      this.blackCardEnabled = data.blackCardEnabled === true;
      this.applyBlackCardSetting();
    }
    if (data.referees !== undefined) {
      this.refereesList = data.referees;
    }
    // Arbitre par défaut fourni par le serveur (arbitre de la poule, #908)
    if (
      data.match?.referee &&
      this.currentMatch &&
      this.currentMatch.id === data.match.id &&
      !this.currentMatch.referee
    ) {
      this.currentMatch.referee = data.match.referee;
    }
    this.updateRefereeBar();

    // Transitions de statut (plan pur : /js/refereeUpdate.js)
    const plan = BPRefereeUpdate.planStatusTransition(
      { currentMatchId: this.currentMatch?.id, matchStatus: this.matchStatus },
      data
    );
    if (plan.hidePoolOverlay) this.hidePoolCompleteOverlay();
    switch (plan.action) {
      case 'poolComplete': // arène libérée, poule terminée
        this._clearActiveMatch();
        this.showPoolCompleteOverlay();
        break;
      case 'closedByApp': // match saisi depuis l'application principale
        this.showNotification(window.T('referee.closed_by_app'));
        this.stopTimer();
        setTimeout(() => {
          this._clearActiveMatch();
          this.showNextMatchesScreen();
        }, 2000);
        break;
      case 'idleClear':
        this._clearActiveMatch();
        this.showNextMatchesScreen();
        break;
      case 'resume': // reconnexion pendant un match en cours : restaurer la liste de sélection
        BPRefereeUpdate.replaceOrPush(this.matches, plan.match);
        this.loadNextMatches();
        this.showNextMatchesScreen();
        this.showNotification(window.T('referee.match_resume_hint'));
        break;
      case 'notifyNextAfter': // sans interrompre un match en cours
        this.showNotification(window.T('referee.next_after'));
        break;
      case 'newMatch': {
        BPRefereeUpdate.markReadyOrPush(this.matches, plan.match);
        // Si l'arbitre avait un ancien match ouvert, fermer le panneau pour revenir à la liste
        const activePanel = document.getElementById('active-match');
        if (activePanel && activePanel.classList.contains('visible')) {
          this._clearActiveMatch();
        }
        // Rafraîchir et afficher l'écran de sélection
        this.loadNextMatches();
        this.showNextMatchesScreen();
        this.showNotification(window.T('referee.next_available'));
        break;
      }
    }
  }

  _clearActiveMatch() {
    this._clearStoredTimer();
    this.currentMatch = null;
    this.scoreA = 0;
    this.scoreB = 0;
    this.cardsA = [];
    this.cardsB = [];
    this.touchesA = [];
    this.touchesB = [];
    this.faultHistoryA = { 1: 0, 2: 0, 3: 0 };
    this.faultHistoryB = { 1: 0, 2: 0, 3: 0 };
    this.matchStatus = 'not_started';
    this.isSuddenDeath = false;
    this.waitingOvertimeStart = false;
    this.waitingCoinFlip = false;
    this.isResting = false;
    this.overtimeType = null;
    this.actionHistory = [];
    this.timerSeconds = this.defaultTimerSeconds;
    this.updateTimerDisplay();
    document.getElementById('active-match').classList.remove('visible');
    this.updateControlButtons();
  }

  updateRefereeBar() {
    const bar = document.getElementById('referee-bar');
    if (!bar) return;
    if (!this.refereeFeatureEnabled) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');

    const nameEl = document.getElementById('referee-bar-name');
    const ref = this.currentMatch?.referee;
    if (nameEl) nameEl.textContent = ref ? ref.name : '—';

    const sel = document.getElementById('referee-select');
    if (sel) {
      sel.innerHTML = `<option value="">${escHtml(window.T('referee.select_referee'))}</option>`;
      for (const r of this.refereesList || []) {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        if (ref && r.id === ref.id) opt.selected = true;
        sel.appendChild(opt);
      }
    }
  }

  toggleRefereeSelector() {
    const sel = document.getElementById('referee-selector');
    if (sel) sel.classList.toggle('hidden');
  }

  changeReferee(refereeId) {
    if (!refereeId || !this.currentMatch) return;
    this.socket.emit('arena_control', {
      arenaId: this.arenaId,
      action: 'change_referee',
      matchId: this.currentMatch.id,
      refereeId,
    });
    const ref = (this.refereesList || []).find(r => r.id === refereeId);
    if (ref) {
      this.currentMatch.referee = { id: ref.id, name: ref.name };
      const nameEl = document.getElementById('referee-bar-name');
      if (nameEl) nameEl.textContent = ref.name;
    }
    const sel = document.getElementById('referee-selector');
    if (sel) sel.classList.add('hidden');
    this.showNotification(window.T('referee.referee_updated'));
  }

  showNextMatchesScreen() {
    document.getElementById('next-matches-screen').classList.add('visible');
    this.loadNextMatches();
  }

  hideNextMatchesScreen() {
    document.getElementById('next-matches-screen').classList.remove('visible');
  }

  showPoolCompleteOverlay() {
    document.getElementById('pool-complete-overlay').classList.add('visible');
  }

  hidePoolCompleteOverlay() {
    document.getElementById('pool-complete-overlay').classList.remove('visible');
  }

  goToSignature() {
    window.location.href = `/arene${this.arenaNumber}/poule`;
  }

  async loadNextMatches() {
    // Vague lancée ou terminée depuis le chargement : changer de sous-piste (#1118)
    const idle = !this.timerRunning && this.matchStatus !== 'in_progress';
    if (idle && (await window.bpClaimArenaSlot(this.baseArenaId, this.arenaId)) !== this.arenaId)
      return window.location.reload();
    const container = document.getElementById('next-matches-list');
    container.innerHTML = `<div class="next-matches-empty">${window.T('remote.loading')}</div>`;
    try {
      const response = await fetch(`/api/arenas/${this.arenaId}/matches`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const pending = BPRefereeLists.pendingMatches(data);
      // Fusionner dans this.matches pour que selectMatch() fonctionne
      BPRefereeLists.mergeMatches(this.matches, pending);
      this.allMatches = pending;
      // Remettre la recherche à zéro
      const searchInput = document.getElementById('match-search');
      if (searchInput) searchInput.value = '';
      this.renderNextMatchesList(pending);
      this.loadBlackCards();
    } catch (error) {
      console.error('Erreur chargement prochains matchs:', error);
      container.innerHTML = `<div class="next-matches-empty">${window.T('remote.error_connection')}</div>`;
    }
  }

  // Cartons noirs annulables (erreur d'arbitrage) affichés au-dessus de la liste des matchs
  async loadBlackCards() {
    const container = document.getElementById('black-cards-list');
    if (!container) return;
    let cards = [];
    try {
      const resp = await fetch(`/api/arenas/${this.arenaId}/black-cards`);
      if (resp.ok) cards = (await resp.json()).blackCards || [];
    } catch (e) {
      console.error('Erreur chargement cartons noirs:', e);
    }
    if (cards.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <div style="margin-bottom:1rem;padding:0.75rem;border:2px solid var(--c-111111);border-radius:0.75rem;background:rgba(0,0,0,0.35);">
        <div style="font-weight:700;margin-bottom:0.5rem;">${bpIcon('card')} ${escHtml(window.T('referee.black_cards'))}</div>
        ${cards
          .map(
            c => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.4rem 0;">
            <div>
              <div style="font-weight:700;">${escHtml(c.fencerName) || '?'}</div>
              <div style="font-size:0.8rem;opacity:0.75;">${escHtml(window.T('referee.against'))} ${escHtml(c.opponentName) || '?'}</div>
            </div>
            <button data-click="refereeApp.cancelBlackCardFromList" data-args="${escHtml(JSON.stringify([c.fencerId]))}"
              style="padding:0.6rem 1rem;border:none;border-radius:0.5rem;background:var(--tw-gray-50);color:var(--c-111111);font-weight:700;font-size:0.9rem;cursor:pointer;">
              ${bpIcon('undo')} ${escHtml(window.T('referee.cancel_card'))}
            </button>
          </div>`
          )
          .join('')}
      </div>`;
  }

  async cancelBlackCardFromList(fencerId) {
    // eslint-disable-next-line no-alert -- confirmation native volontaire : annulation irréversible d'un carton noir
    if (!confirm(window.T('referee.confirm_cancel_black'))) return;
    try {
      const resp = await fetch(
        `/api/arenas/${this.arenaId}/black-cards/${encodeURIComponent(fencerId)}/cancel`,
        {
          method: 'POST',
        }
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        this.showNotification(window.errorText(data, window.T('error.update_failed')), true);
        return;
      }
      this.showNotification(window.T('referee.black_card_cancelled'));
      // Le match rouvert doit être rechargé avec son score
      this.matches = this.matches.filter(m => m.id !== data.matchId);
      this.loadNextMatches();
    } catch (e) {
      console.error('Erreur annulation carton noir:', e);
      this.showNotification(window.T('remote.error_connection'), true);
    }
  }

  renderNextMatchesList(matches) {
    const container = document.getElementById('next-matches-list');
    container.innerHTML = BPRefereeLists.renderNextMatchesHtml(matches, {
      T: window.T,
      escHtml,
      bpIcon,
      arenaNum: this.arenaNumber || document.getElementById('arena-number').textContent,
    });
  }

  filterMatches(query) {
    if (!this.allMatches) return;
    this.renderNextMatchesList(BPRefereeLists.filterMatches(this.allMatches, query));
  }

  selectMatchFromNextScreen(matchId) {
    this.hideNextMatchesScreen();
    this.selectMatch(matchId);
  }

  showNotification(message, isError = false) {
    const notif = document.getElementById('notification');
    notif.textContent = message;
    notif.className = 'notification' + (isError ? ' error' : '');
    notif.classList.add('show');

    setTimeout(() => {
      notif.classList.remove('show');
    }, 3000);
  }
}

// Initialisation
let refereeApp;
// Actions des boutons (data-click) : plus de handlers inline (CSP, #1149)
function openJournal() {
  const n = refereeApp?.arenaNumber || document.getElementById('arena-number')?.textContent;
  window.open('/arene' + encodeURIComponent(n) + '/journal', '_blank');
}
function reloadIfIdle() {
  if (refereeApp.timerRunning) return;
  // Chrono jamais lancé : le match redevient disponible pour les autres tablettes (#1118)
  const open = !!refereeApp.currentMatch;
  if (open)
    refereeApp.socket?.emit('arena_control', {
      arenaId: refereeApp.arenaId,
      action: 'release_match',
    });
  setTimeout(() => window.location.reload(), open ? 200 : 0);
}
window.BPTimer.withTenths(RefereeApp.prototype);
window.BPPriorityDraw.installReferee(RefereeApp.prototype);
window.BPDemoMirror.install(RefereeApp.prototype); // démo autonome (?demo=1)
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await window.initRemoteI18n();
    document.title = window.T('referee.title');
    refereeApp = new RefereeApp(await window.bpClaimArenaSlot(RefereeApp.prototype.getArenaId()));
    window.refereeApp = refereeApp;
    window.BPRefereeLobby.install(window, () => refereeApp).catch(() => {}); // lobby entraînement (#1500) ; résolu par la délégation data-click (common.js)
  } catch (e) {
    console.error('[RefereeApp] Erreur init:', e);
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('connection-text');
    if (dot) {
      dot.classList.add('disconnected');
      dot.classList.remove('connected');
    }
    if (text) text.textContent = `${window.T('referee.error')}: ${e?.message || e}`;
  }
});
