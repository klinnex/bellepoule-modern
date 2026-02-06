"use strict";
/**
 * BellePoule Modern - Remote Score Entry Server
 * Web server for referees to enter scores remotely
 * Licensed under GPL-3.0
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteScoreServer = void 0;
const express_1 = __importDefault(require("express"));
const socket_io_1 = require("socket.io");
const http_1 = require("http");
const path_1 = __importDefault(require("path"));
const types_1 = require("../shared/types");
class RemoteScoreServer {
    constructor(db, port = 3001) {
        this.session = null;
        this.connectedReferees = new Map();
        this.arenas = new Map();
        this.arenaTimers = new Map();
        this.db = db;
        this.port = port;
        this.app = (0, express_1.default)();
        this.server = (0, http_1.createServer)(this.app);
        this.io = new socket_io_1.Server(this.server, {
            cors: {
                origin: ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
                methods: ["GET", "POST"]
            }
        });
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.initializeArenas();
    }
    setupMiddleware() {
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.static(path_1.default.join(__dirname, '../remote')));
        this.app.use((req, res, next) => {
            const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'];
            const origin = req.headers.origin;
            if (origin && allowedOrigins.includes(origin)) {
                res.header('Access-Control-Allow-Origin', origin);
            }
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });
    }
    setupRoutes() {
        // Route principale pour les arbitres
        this.app.get('/', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../remote/index.html'));
        });
        // API endpoints
        this.app.get('/api/session', (req, res) => {
            if (!this.session) {
                return res.status(404).json({ error: 'Aucune session active' });
            }
            res.json(this.session);
        });
        this.app.post('/api/session/start', async (req, res) => {
            try {
                const { competitionId, strips } = req.body;
                const competition = this.db.getCompetition(competitionId);
                if (!competition) {
                    return res.status(404).json({ error: 'Compétition non trouvée' });
                }
                this.session = await this.createSession(competitionId, strips);
                res.json(this.session);
            }
            catch (error) {
                console.error('Error starting session:', error);
                res.status(500).json({ error: 'Erreur lors du démarrage de la session' });
            }
        });
        this.app.post('/api/session/stop', (req, res) => {
            this.session = null;
            this.connectedReferees.clear();
            res.json({ success: true });
        });
        this.app.get('/api/referees', (req, res) => {
            if (!this.session) {
                return res.status(404).json({ error: 'Aucune session active' });
            }
            res.json(this.session.referees);
        });
        // Arena routes
        this.app.get('/api/arenas', (req, res) => {
            res.json(this.getAllArenas());
        });
        this.app.get('/api/arenas/:arenaId', (req, res) => {
            const arena = this.getArena(req.params.arenaId);
            if (!arena) {
                return res.status(404).json({ error: 'Arène non trouvée' });
            }
            res.json(arena);
        });
        this.app.post('/api/arenas/:arenaId/assign', (req, res) => {
            const { match } = req.body;
            try {
                this.assignMatchToArena(req.params.arenaId, match);
                res.json({ success: true });
            }
            catch (error) {
                res.status(500).json({ error: error instanceof Error ? error.message : 'Erreur inconnue' });
            }
        });
        this.app.post('/api/arenas/:arenaId/start', (req, res) => {
            this.startArenaMatch(req.params.arenaId);
            res.json({ success: true });
        });
        this.app.post('/api/arenas/:arenaId/pause', (req, res) => {
            this.pauseArenaMatch(req.params.arenaId);
            res.json({ success: true });
        });
        this.app.post('/api/arenas/:arenaId/score', (req, res) => {
            const { scoreA, scoreB } = req.body;
            this.updateArenaScore(req.params.arenaId, scoreA, scoreB);
            res.json({ success: true });
        });
        this.app.post('/api/arenas/:arenaId/finish', (req, res) => {
            this.finishArenaMatch(req.params.arenaId);
            res.json({ success: true });
        });
        // Pages d'arène
        this.app.get('/arena1', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../remote/arena.html'));
        });
        this.app.get('/arena2', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../remote/arena.html'));
        });
        this.app.get('/arena3', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../remote/arena.html'));
        });
        this.app.get('/arena4', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../remote/arena.html'));
        });
        // Interface d'arbitrage
        this.app.get('/arena1/referee', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../remote/referee.html'));
        });
        this.app.get('/arena2/referee', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../remote/referee.html'));
        });
        this.app.get('/arena3/referee', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../remote/referee.html'));
        });
        this.app.get('/arena4/referee', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../remote/referee.html'));
        });
        this.app.post('/api/referees', (req, res) => {
            if (!this.session) {
                return res.status(404).json({ error: 'Aucune session active' });
            }
            const referee = {
                id: `ref_${Date.now()}`,
                name: req.body.name,
                code: req.body.code || this.generateRefereeCode(),
                isActive: true,
                lastActivity: new Date()
            };
            this.session.referees.push(referee);
            res.json(referee);
        });
        this.app.get('/api/strips', (req, res) => {
            if (!this.session) {
                return res.status(404).json({ error: 'Aucune session active' });
            }
            res.json(this.session.strips);
        });
        this.app.post('/api/matches/:matchId/score', async (req, res) => {
            try {
                const { matchId } = req.params;
                const scoreUpdate = req.body;
                // Mettre à jour le match dans la base de données
                await this.updateMatchScore(matchId, scoreUpdate);
                // Diffuser la mise à jour à tous les clients connectés
                this.broadcastMessage({
                    type: 'score_update',
                    data: { matchId, scoreUpdate },
                    timestamp: new Date(),
                    sender: 'server'
                });
                res.json({ success: true });
            }
            catch (error) {
                console.error('Error updating score:', error);
                res.status(500).json({ error: 'Erreur lors de la mise à jour du score' });
            }
        });
    }
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);
            socket.on('message', (data) => {
                this.handleClientMessage(socket, data);
            });
            // Gestion des arènes
            socket.on('join_arena', (data) => {
                console.log(`Client ${socket.id} joining arena ${data.arenaId} as ${data.role || 'spectator'}`);
                socket.join(`arena:${data.arenaId}`);
                // Envoyer l'état actuel de l'arène
                const arena = this.getArena(data.arenaId);
                if (arena) {
                    socket.emit(`arena:${data.arenaId}:update`, {
                        arenaId: data.arenaId,
                        match: arena.currentMatch,
                        scoreA: arena.currentMatch?.scoreA,
                        scoreB: arena.currentMatch?.scoreB,
                        time: arena.elapsedTime,
                        status: arena.status,
                        fencerA: arena.currentMatch?.fencerA,
                        fencerB: arena.currentMatch?.fencerB
                    });
                }
            });
            socket.on('arena_control', (data) => {
                this.handleArenaControl(socket, data);
            });
            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
                this.handleDisconnect(socket);
            });
        });
    }
    handleDisconnect(socket) {
        const referee = this.connectedReferees.get(socket.id);
        if (referee) {
            referee.isActive = false;
            referee.lastActivity = new Date();
            // Notifier les autres clients
            this.broadcastMessage({
                type: 'referee_disconnected',
                data: { refereeId: referee.id, refereeName: referee.name },
                timestamp: new Date(),
                sender: 'server'
            }, socket.id);
            console.log(`Referee ${referee.name} disconnected`);
        }
        this.connectedReferees.delete(socket.id);
    }
    handleArenaControl(socket, data) {
        const arena = this.getArena(data.arenaId);
        if (!arena) {
            socket.emit('error', { message: 'Arène non trouvée' });
            return;
        }
        switch (data.action) {
            case 'start':
                this.startArenaMatch(data.arenaId);
                break;
            case 'pause':
                this.pauseArenaMatch(data.arenaId);
                break;
            case 'finish':
                this.finishArenaMatch(data.arenaId);
                break;
            case 'next':
                this.loadNextMatch(data.arenaId);
                break;
            case 'update_score':
                if (data.scoreA !== undefined && data.scoreB !== undefined) {
                    this.updateArenaScore(data.arenaId, data.scoreA, data.scoreB);
                }
                break;
            case 'reset_scores':
                if (arena.currentMatch) {
                    this.updateArenaScore(data.arenaId, 0, 0);
                }
                break;
            default:
                socket.emit('error', { message: 'Action non reconnue' });
        }
    }
    async handleClientMessage(socket, message) {
        switch (message.type) {
            case 'login':
                await this.handleRefereeLogin(socket, message.data);
                break;
            case 'score_update':
                await this.handleScoreUpdate(socket, message.data);
                break;
            case 'match_complete':
                await this.handleMatchComplete(socket, message.data);
                break;
            case 'heartbeat':
                await this.handleHeartbeat(socket);
                break;
            case 'logout':
                this.handleRefereeDisconnection(socket);
                break;
        }
    }
    async handleRefereeLogin(socket, data) {
        if (!this.session) {
            socket.emit('message', {
                type: 'login_error',
                data: { error: 'Aucune session active' }
            });
            return;
        }
        const referee = this.session.referees.find(r => r.code === data.code);
        if (!referee) {
            socket.emit('message', {
                type: 'login_error',
                data: { error: 'Code d\'arbitre invalide' }
            });
            return;
        }
        referee.isActive = true;
        referee.lastActivity = new Date();
        this.connectedReferees.set(socket.id, referee);
        socket.emit('message', {
            type: 'login_success',
            data: { referee }
        });
        // Notifier les autres clients
        this.broadcastMessage({
            type: 'referee_connected',
            data: { refereeId: referee.id, refereeName: referee.name },
            timestamp: new Date(),
            sender: 'server'
        }, socket.id);
        console.log(`Referee ${referee.name} connected with code ${data.code}`);
    }
    async handleScoreUpdate(socket, data) {
        try {
            const referee = this.connectedReferees.get(socket.id);
            if (!referee) {
                socket.emit('message', {
                    type: 'error',
                    data: { error: 'Non authentifié' }
                });
                return;
            }
            data.refereeId = referee.id;
            await this.updateMatchScore(data.matchId, data);
            // Diffuser la mise à jour
            this.broadcastMessage({
                type: 'score_update_broadcast',
                data: { scoreUpdate: data },
                timestamp: new Date(),
                sender: referee.id
            });
        }
        catch (error) {
            console.error('Error handling score update:', error);
            socket.emit('message', {
                type: 'error',
                data: { error: 'Erreur lors de la mise à jour du score' }
            });
        }
    }
    async handleMatchComplete(socket, data) {
        const referee = this.connectedReferees.get(socket.id);
        if (!referee)
            return;
        // Mettre à jour le statut du match
        referee.currentMatch = undefined;
        referee.lastActivity = new Date();
        // Notifier le système principal
        this.broadcastMessage({
            type: 'match_finished',
            data: { matchId: data.matchId, refereeId: referee.id },
            timestamp: new Date(),
            sender: referee.id
        });
    }
    async handleHeartbeat(socket) {
        const referee = this.connectedReferees.get(socket.id);
        if (referee) {
            referee.lastActivity = new Date();
            socket.emit('message', {
                type: 'session_update',
                data: { timestamp: new Date() }
            });
        }
    }
    handleRefereeDisconnection(socket) {
        const referee = this.connectedReferees.get(socket.id);
        if (referee) {
            referee.isActive = false;
            referee.currentMatch = undefined;
            this.connectedReferees.delete(socket.id);
            this.broadcastMessage({
                type: 'referee_disconnected',
                data: { refereeId: referee.id, refereeName: referee.name },
                timestamp: new Date(),
                sender: 'server'
            });
        }
    }
    async createSession(competitionId, strips) {
        const competition = this.db.getCompetition(competitionId);
        if (!competition) {
            throw new Error('Compétition non trouvée');
        }
        const session = {
            competitionId,
            strips: Array.from({ length: strips }, (_, i) => ({
                number: i + 1,
                status: 'available'
            })),
            referees: [],
            activeMatches: [],
            isRunning: true,
            startTime: new Date()
        };
        return session;
    }
    async updateMatchScore(matchId, update) {
        // Mettre à jour le match dans la base de données
        const match = this.db.getMatch(matchId);
        if (!match) {
            throw new Error('Match non trouvé');
        }
        const scoreA = {
            value: update.scoreA,
            isVictory: update.winner === 'A',
            isAbstention: update.specialStatus === 'abandon' && update.winner !== 'A',
            isExclusion: update.specialStatus === 'exclusion' && update.winner !== 'A',
            isForfait: update.specialStatus === 'forfait' && update.winner !== 'A'
        };
        const scoreB = {
            value: update.scoreB,
            isVictory: update.winner === 'B',
            isAbstention: update.specialStatus === 'abandon' && update.winner !== 'B',
            isExclusion: update.specialStatus === 'exclusion' && update.winner !== 'B',
            isForfait: update.specialStatus === 'forfait' && update.winner !== 'B'
        };
        this.db.updateMatch(matchId, {
            scoreA,
            scoreB,
            status: update.status === 'finished' ? types_1.MatchStatus.FINISHED : types_1.MatchStatus.IN_PROGRESS
        });
    }
    broadcastMessage(message, excludeSocketId) {
        this.connectedReferees.forEach((referee, socketId) => {
            if (socketId !== excludeSocketId) {
                const socket = Array.from(this.io.sockets.sockets.values()).find(s => s.id === socketId);
                if (socket) {
                    socket.emit('message', message);
                }
            }
        });
        // Envoyer aussi à la fenêtre principale
        if (global.mainWindow) {
            global.mainWindow.webContents.send('remote:websocket_message', message);
        }
    }
    generateRefereeCode() {
        const { randomBytes } = require('crypto');
        return randomBytes(4).toString('hex').substring(0, 6).toUpperCase();
    }
    initializeArenas() {
        // Créer 4 arènes par défaut
        for (let i = 1; i <= 4; i++) {
            const arena = {
                id: `arena${i}`,
                name: `Arène ${i}`,
                number: i,
                currentMatch: null,
                status: 'idle',
                startTime: null,
                elapsedTime: 0,
                settings: {
                    matchDuration: 180, // 3 minutes par défaut
                    breakDuration: 30, // 30 secondes entre les matchs
                    autoAdvance: false
                }
            };
            this.arenas.set(arena.id, arena);
        }
    }
    // Méthodes publiques pour les arènes
    getArena(arenaId) {
        return this.arenas.get(arenaId) || null;
    }
    getAllArenas() {
        return Array.from(this.arenas.values());
    }
    updateArena(arenaId, update) {
        const arena = this.arenas.get(arenaId);
        if (!arena)
            return;
        Object.assign(arena, update);
        // Diffuser la mise à jour via WebSocket
        this.broadcastArenaUpdate(arenaId, {
            arenaId,
            match: arena.currentMatch,
            scoreA: arena.currentMatch?.scoreA,
            scoreB: arena.currentMatch?.scoreB,
            time: arena.elapsedTime,
            status: arena.status,
            fencerA: arena.currentMatch?.fencerA,
            fencerB: arena.currentMatch?.fencerB
        });
    }
    assignMatchToArena(arenaId, match) {
        const arena = this.arenas.get(arenaId);
        if (!arena)
            return;
        arena.currentMatch = match;
        arena.status = 'ready';
        arena.elapsedTime = 0;
        this.updateArena(arenaId, {
            status: 'ready',
            elapsedTime: 0
        });
    }
    startArenaMatch(arenaId) {
        const arena = this.arenas.get(arenaId);
        if (!arena || !arena.currentMatch)
            return;
        arena.status = 'in_progress';
        arena.startTime = new Date();
        arena.currentMatch.status = 'in_progress';
        arena.currentMatch.startTime = new Date();
        // Démarrer le chronomètre
        this.startArenaTimer(arenaId);
        this.updateArena(arenaId, {
            status: 'in_progress',
            startTime: arena.startTime,
            currentMatch: arena.currentMatch
        });
    }
    pauseArenaMatch(arenaId) {
        const arena = this.arenas.get(arenaId);
        if (!arena)
            return;
        arena.status = 'ready';
        // Arrêter le chronomètre
        this.stopArenaTimer(arenaId);
        this.updateArena(arenaId, { status: 'ready' });
    }
    updateArenaScore(arenaId, scoreA, scoreB) {
        const arena = this.arenas.get(arenaId);
        if (!arena || !arena.currentMatch)
            return;
        arena.currentMatch.scoreA = scoreA;
        arena.currentMatch.scoreB = scoreB;
        // Envoyer la mise à jour via WebSocket
        this.broadcastArenaUpdate(arenaId, {
            arenaId,
            match: arena.currentMatch,
            scoreA,
            scoreB,
            status: arena.status
        });
    }
    finishArenaMatch(arenaId) {
        const arena = this.arenas.get(arenaId);
        if (!arena || !arena.currentMatch)
            return;
        arena.status = 'finished';
        arena.currentMatch.status = 'finished';
        arena.currentMatch.endTime = new Date();
        if (arena.startTime) {
            arena.currentMatch.duration = Math.floor((new Date().getTime() - arena.startTime.getTime()) / 1000);
        }
        // Arrêter le chronomètre
        this.stopArenaTimer(arenaId);
        this.updateArena(arenaId, {
            status: 'finished',
            currentMatch: arena.currentMatch
        });
    }
    startArenaTimer(arenaId) {
        this.stopArenaTimer(arenaId); // Arrêter le timer existant
        const timer = setInterval(() => {
            const arena = this.arenas.get(arenaId);
            if (!arena || arena.status !== 'in_progress') {
                this.stopArenaTimer(arenaId);
                return;
            }
            arena.elapsedTime++;
            // Envoyer la mise à jour du temps
            this.broadcastArenaUpdate(arenaId, {
                arenaId,
                match: arena.currentMatch,
                time: arena.elapsedTime,
                status: arena.status
            });
            // Vérifier si le temps est écoulé
            if (arena.elapsedTime >= arena.settings.matchDuration) {
                this.finishArenaMatch(arenaId);
                // Charger le match suivant automatiquement si activé
                if (arena.settings.autoAdvance) {
                    setTimeout(() => {
                        this.loadNextMatch(arenaId);
                    }, arena.settings.breakDuration * 1000);
                }
            }
        }, 1000);
        this.arenaTimers.set(arenaId, timer);
    }
    stopArenaTimer(arenaId) {
        const timer = this.arenaTimers.get(arenaId);
        if (timer) {
            clearInterval(timer);
            this.arenaTimers.delete(arenaId);
        }
    }
    broadcastArenaUpdate(arenaId, update) {
        // Envoyer via Socket.IO aux clients connectés aux arènes
        this.io.emit(`arena:${arenaId}:update`, update);
        // Envoyer aussi à la fenêtre principale
        if (global.mainWindow) {
            global.mainWindow.webContents.send('arena:update', { arenaId, update });
        }
    }
    async loadNextMatch(arenaId) {
        // Logique pour charger le match suivant depuis les poules
        // À implémenter selon la logique de compétition
        const arena = this.arenas.get(arenaId);
        if (!arena)
            return;
        // Pour l'instant, réinitialiser l'arène
        arena.currentMatch = null;
        arena.status = 'idle';
        arena.elapsedTime = 0;
        arena.startTime = null;
        this.updateArena(arenaId, {
            currentMatch: null,
            status: 'idle',
            elapsedTime: 0,
            startTime: null
        });
    }
    start() {
        this.server.listen(this.port, () => {
            console.log(`Remote score server started on port ${this.port}`);
            console.log(`Arbitres peuvent se connecter sur: http://localhost:${this.port}`);
        });
    }
    stop() {
        // Nettoyer tous les timers d'arène
        this.arenaTimers.forEach((timer) => {
            clearInterval(timer);
        });
        this.arenaTimers.clear();
        if (this.server) {
            this.server.close();
            console.log('Remote score server stopped');
        }
    }
    getSession() {
        return this.session;
    }
    getConnectedReferees() {
        return Array.from(this.connectedReferees.values());
    }
}
exports.RemoteScoreServer = RemoteScoreServer;
//# sourceMappingURL=remoteScoreServer.js.map