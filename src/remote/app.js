/**
 * BellePoule Modern - Remote Referee Interface JavaScript
 * Frontend for remote score entry
 */

// Échappement HTML des données issues des tireurs (noms)
function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

class RemoteRefereeApp {
    constructor() {
        this.socket = null;
        this.referee = null;
        this.currentMatch = null;
        this.nextMatches = [];
        this.completedMatches = [];
        this.isConnected = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.connectToServer();
    }

    initializeElements() {
        // Screens
        this.loginScreen = document.getElementById('login-screen');
        this.mainScreen = document.getElementById('main-screen');
        
        // Login elements
        this.loginForm = document.getElementById('login-form');
        this.refereeCodeInput = document.getElementById('referee-code');
        this.loginError = document.getElementById('login-error');
        
        // Header elements
        this.refereeNameSpan = document.getElementById('referee-name');
        this.connectionStatus = document.getElementById('connection-status');
        this.logoutBtn = document.getElementById('logout-btn');
        
        // Match elements
        this.stripNumber = document.getElementById('strip-number');
        this.matchStatus = document.getElementById('match-status');
        this.currentMatchSection = document.getElementById('current-match');
        
        // Fencer info
        this.fencerAName = document.getElementById('fencer-a-name');
        this.fencerAClub = document.getElementById('fencer-a-club');
        this.fencerBName = document.getElementById('fencer-b-name');
        this.fencerBClub = document.getElementById('fencer-b-club');
        
        // Score inputs
        this.scoreAInput = document.getElementById('score-a');
        this.scoreBInput = document.getElementById('score-b');
        
        // Special status
        this.specialStatusToggle = document.getElementById('special-status-toggle');
        this.specialOptions = document.getElementById('special-options');
        this.specialTypeSelect = document.getElementById('special-type');
        this.winnerRadios = document.querySelectorAll('input[name="winner"]');
        
        // Actions
        this.saveScoreBtn = document.getElementById('save-score');
        this.nextMatchBtn = document.getElementById('next-match');
        
        // Match lists
        this.nextMatchesList = document.getElementById('next-matches-list');
        this.completedMatchesList = document.getElementById('completed-matches-list');
        
        // Notifications
        this.notificationsContainer = document.getElementById('notifications');
    }

    setupEventListeners() {
        // Login form
        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
        
        // Logout
        this.logoutBtn.addEventListener('click', () => {
            this.handleLogout();
        });
        
        // Special status toggle
        this.specialStatusToggle.addEventListener('change', () => {
            this.specialOptions.classList.toggle('hidden', !this.specialStatusToggle.checked);
        });
        
        // Save score
        this.saveScoreBtn.addEventListener('click', () => {
            this.handleSaveScore();
        });
        
        // Next match
        this.nextMatchBtn.addEventListener('click', () => {
            this.handleNextMatch();
        });
        
        // Score inputs
        this.scoreAInput.addEventListener('input', () => {
            this.validateScoreInput();
        });
        
        this.scoreBInput.addEventListener('input', () => {
            this.validateScoreInput();
        });
    }

    connectToServer() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.updateConnectionStatus();
            this.showNotification('Connecté au serveur', 'success');
        });
        
        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.updateConnectionStatus();
            this.showNotification('Déconnecté du serveur', 'error');
        });
        
        this.socket.on('message', (message) => {
            this.handleServerMessage(message);
        });
    }

    updateConnectionStatus() {
        if (this.isConnected) {
            this.connectionStatus.textContent = '🟢 Connecté';
            this.connectionStatus.className = 'status-indicator';
        } else {
            this.connectionStatus.textContent = '🔴 Déconnecté';
            this.connectionStatus.className = 'status-indicator error';
        }
    }

    handleLogin() {
        const code = this.refereeCodeInput.value.trim();
        if (!code) {
            this.showLoginError('Veuillez entrer un code d\'accès');
            return;
        }
        
        this.sendMessage('login', { code });
    }

    handleLogout() {
        this.sendMessage('logout');
        this.referee = null;
        this.currentMatch = null;
        this.showScreen('login');
        this.showNotification('Déconnecté', 'info');
    }

    handleServerMessage(message) {
        switch (message.type) {
            case 'login_success':
                this.handleLoginSuccess(message.data);
                break;
            case 'login_error':
                this.handleLoginError(message.data);
                break;
            case 'match_assignment':
                this.handleMatchAssignment(message.data);
                break;
            case 'session_update':
                this.handleSessionUpdate(message.data);
                break;
            case 'error':
                this.showError(message.data.error);
                break;
        }
    }

    handleLoginSuccess(data) {
        this.referee = data.referee;
        this.refereeNameSpan.textContent = this.referee.name;
        this.showScreen('main');
        this.showNotification(`Bienvenue ${this.referee.name}`, 'success');
        this.sendMessage('heartbeat');
    }

    handleLoginError(data) {
        this.showLoginError(data.error);
    }

    handleMatchAssignment(data) {
        if (data.currentMatch) {
            this.currentMatch = data.currentMatch;
            this.displayCurrentMatch();
        } else {
            this.currentMatch = null;
            this.hideCurrentMatch();
        }
        
        this.nextMatches = data.nextMatches || [];
        this.completedMatches = data.completedMatches || [];
        this.updateMatchLists();
    }

    handleSessionUpdate(data) {
        // Gérer les mises à jour de session si nécessaire
        this.updateConnectionStatus();
    }

    displayCurrentMatch() {
        if (!this.currentMatch) return;
        
        this.stripNumber.textContent = this.currentMatch.stripNumber || '-';
        this.matchStatus.textContent = 'Match en cours';
        
        // Afficher les tireurs
        this.fencerAName.textContent = this.currentMatch.fencerA?.name || '-';
        this.fencerAClub.textContent = this.currentMatch.fencerA?.club || '';
        this.fencerBName.textContent = this.currentMatch.fencerB?.name || '-';
        this.fencerBClub.textContent = this.currentMatch.fencerB?.club || '';
        
        // Initialiser les scores
        this.scoreAInput.value = this.currentMatch.scoreA || 0;
        this.scoreBInput.value = this.currentMatch.scoreB || 0;
        
        // Afficher la section
        this.currentMatchSection.classList.remove('hidden');
        this.nextMatchBtn.classList.add('disabled');
        this.nextMatchBtn.disabled = true;
    }

    hideCurrentMatch() {
        this.currentMatchSection.classList.add('hidden');
        this.matchStatus.textContent = 'En attente de match...';
        this.stripNumber.textContent = '-';
    }

    updateMatchLists() {
        this.updateNextMatchesList();
        this.updateCompletedMatchesList();
    }

    updateNextMatchesList() {
        if (this.nextMatches.length === 0) {
            this.nextMatchesList.innerHTML = '<p class="no-matches">' + escapeHtml(window.T ? window.T('remote.no_scheduled') : 'Aucun match prévu') + '</p>';
            return;
        }
        
        this.nextMatchesList.innerHTML = this.nextMatches.map(match => `
            <div class="match-item">
                <div class="match-item-info">
                    <div class="match-item-fencers">
                        ${escapeHtml(match.fencerA?.name || '-')} vs ${escapeHtml(match.fencerB?.name || '-')}
                    </div>
                    <div class="match-item-details">
                        ${escapeHtml(window.T ? window.T('remote.piste') : 'Piste')} ${escapeHtml(match.stripNumber || '-')}
                    </div>
                </div>
                <div class="match-item-status">En attente</div>
            </div>
        `).join('');
    }

    updateCompletedMatchesList() {
        if (this.completedMatches.length === 0) {
            this.completedMatchesList.innerHTML = '<p class="no-matches">Aucun match terminé</p>';
            return;
        }
        
        this.completedMatchesList.innerHTML = this.completedMatches.map(match => `
            <div class="match-item">
                <div class="match-item-info">
                    <div class="match-item-fencers">
                        ${escapeHtml(match.fencerA?.name || '-')} vs ${escapeHtml(match.fencerB?.name || '-')}
                    </div>
                    <div class="match-item-details">
                        Score: ${escapeHtml(match.scoreA || 0)} - ${escapeHtml(match.scoreB || 0)}
                    </div>
                </div>
                <div class="match-item-status">Terminé</div>
            </div>
        `).join('');
    }

    handleSaveScore() {
        if (!this.currentMatch || !this.referee) return;
        
        const scoreA = parseInt(this.scoreAInput.value) || 0;
        const scoreB = parseInt(this.scoreBInput.value) || 0;
        
        let winner = undefined;
        let specialStatus = undefined;
        
        if (this.specialStatusToggle.checked) {
            specialStatus = this.specialTypeSelect.value;
            if (specialStatus) {
                const selectedWinner = document.querySelector('input[name="winner"]:checked');
                winner = selectedWinner ? selectedWinner.value : undefined;
            }
        } else {
            // Déterminer le vainqueur normalement
            if (scoreA > scoreB) winner = 'A';
            else if (scoreB > scoreA) winner = 'B';
        }
        
        const scoreData = {
            matchId: this.currentMatch.id,
            scoreA,
            scoreB,
            status: 'finished',
            winner,
            specialStatus,
            timestamp: new Date(),
            refereeId: this.referee.id
        };
        
        this.sendMessage('score_update', scoreData);
        this.showNotification('Score enregistré', 'success');
        
        // Activer le bouton "Match suivant"
        this.nextMatchBtn.classList.remove('disabled');
        this.nextMatchBtn.disabled = false;
    }

    handleNextMatch() {
        if (!this.referee) return;
        
        this.sendMessage('match_complete', { 
            matchId: this.currentMatch?.id 
        });
        
        this.currentMatch = null;
        this.hideCurrentMatch();
        this.resetScoreInputs();
        
        // Demander le prochain match
        this.sendMessage('heartbeat');
    }

    validateScoreInput() {
        const scoreA = parseInt(this.scoreAInput.value) || 0;
        const scoreB = parseInt(this.scoreBInput.value) || 0;
        
        // Valider que les scores sont positifs
        if (scoreA < 0) this.scoreAInput.value = 0;
        if (scoreB < 0) this.scoreBInput.value = 0;
    }

    resetScoreInputs() {
        this.scoreAInput.value = 0;
        this.scoreBInput.value = 0;
        this.specialStatusToggle.checked = false;
        this.specialOptions.classList.add('hidden');
        this.specialTypeSelect.value = '';
        document.querySelector('input[name="winner"][value="A"]').checked = true;
    }

    sendMessage(type, data = {}) {
        if (!this.socket || !this.isConnected) {
            this.showNotification('Non connecté au serveur', 'error');
            return;
        }
        
        this.socket.emit('message', { type, data });
    }

    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }
    }

    showLoginError(message) {
        this.loginError.textContent = message;
        this.loginError.classList.remove('hidden');
        
        setTimeout(() => {
            this.loginError.classList.add('hidden');
        }, 5000);
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        this.notificationsContainer.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
}

// Initialiser l'application quand le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    new RemoteRefereeApp();
});