/**
 * BellePoule Modern - Remote Score Entry Server
 * Web server for referees to enter scores remotely
 * Licensed under GPL-3.0
 */

import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import { 
  RemoteSession, 
  RemoteReferee, 
  RemoteStrip, 
  RemoteMatch,
  RemoteScoreUpdate,
  ClientMessage,
  ServerMessage,
  WebSocketMessage,
  Arena,
  ArenaMatch,
  ArenaSettings,
  ArenaUpdate
} from '../shared/types/remote';
import { Competition, Match, Fencer, MatchStatus, Score } from '../shared/types';
import { DatabaseManager } from '../database';

export class RemoteScoreServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private port: number;
  private db: DatabaseManager;
  private session: RemoteSession | null = null;
  private connectedReferees: Map<string, RemoteReferee> = new Map();
  private arenas: Map<string, Arena> = new Map();
  private arenaTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(db: DatabaseManager, port: number = 3001) {
    this.db = db;
    this.port = port;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
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

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../remote')));
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

  private setupRoutes(): void {
    // Route principale pour les arbitres
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../remote/index.html'));
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
      } catch (error) {
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
      } catch (error) {
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
      res.sendFile(path.join(__dirname, '../remote/arena.html'));
    });

    this.app.get('/arena2', (req, res) => {
      res.sendFile(path.join(__dirname, '../remote/arena.html'));
    });

    this.app.get('/arena3', (req, res) => {
      res.sendFile(path.join(__dirname, '../remote/arena.html'));
    });

    this.app.get('/arena4', (req, res) => {
      res.sendFile(path.join(__dirname, '../remote/arena.html'));
    });

    // Interface d'arbitrage
    this.app.get('/arena1/referee', (req, res) => {
      res.sendFile(path.join(__dirname, '../remote/referee.html'));
    });

    this.app.get('/arena2/referee', (req, res) => {
      res.sendFile(path.join(__dirname, '../remote/referee.html'));
    });

    this.app.get('/arena3/referee', (req, res) => {
      res.sendFile(path.join(__dirname, '../remote/referee.html'));
    });

    this.app.get('/arena4/referee', (req, res) => {
      res.sendFile(path.join(__dirname, '../remote/referee.html'));
    });

    this.app.post('/api/referees', (req, res) => {
      if (!this.session) {
        return res.status(404).json({ error: 'Aucune session active' });
      }

      const referee: RemoteReferee = {
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
        const scoreUpdate: RemoteScoreUpdate = req.body;
        
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
      } catch (error) {
        console.error('Error updating score:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour du score' });
      }
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: any) => {
      console.log('Client connected:', socket.id);
      
      socket.on('message', (data: ClientMessage) => {
        this.handleClientMessage(socket, data);
      });
      
      // Gestion des arènes
      socket.on('join_arena', (data: { arenaId: string, role?: string }) => {
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
      
      socket.on('arena_control', (data: { arenaId: string, action: string, scoreA?: number, scoreB?: number }) => {
        this.handleArenaControl(socket, data);
      });
      
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        this.handleDisconnect(socket);
      });
    });
  }

  private handleDisconnect(socket: any): void {
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

  private handleArenaControl(socket: any, data: { arenaId: string, action: string, scoreA?: number, scoreB?: number }): void {
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

  private async handleClientMessage(socket: any, message: ClientMessage): Promise<void> {
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

  private async handleRefereeLogin(socket: any, data: { code: string }): Promise<void> {
    if (!this.session) {
      socket.emit('message', {
        type: 'login_error',
        data: { error: 'Aucune session active' }
      } as ServerMessage);
      return;
    }

    const referee = this.session.referees.find(r => r.code === data.code);
    if (!referee) {
      socket.emit('message', {
        type: 'login_error',
        data: { error: 'Code d\'arbitre invalide' }
      } as ServerMessage);
      return;
    }

    referee.isActive = true;
    referee.lastActivity = new Date();
    this.connectedReferees.set(socket.id, referee);

    socket.emit('message', {
      type: 'login_success',
      data: { referee }
    } as ServerMessage);

    // Notifier les autres clients
    this.broadcastMessage({
      type: 'referee_connected',
      data: { refereeId: referee.id, refereeName: referee.name },
      timestamp: new Date(),
      sender: 'server'
    }, socket.id);

    console.log(`Referee ${referee.name} connected with code ${data.code}`);
  }

  private async handleScoreUpdate(socket: any, data: RemoteScoreUpdate): Promise<void> {
    try {
      const referee = this.connectedReferees.get(socket.id);
      if (!referee) {
        socket.emit('message', {
          type: 'error',
          data: { error: 'Non authentifié' }
        } as ServerMessage);
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
    } catch (error) {
      console.error('Error handling score update:', error);
      socket.emit('message', {
        type: 'error',
        data: { error: 'Erreur lors de la mise à jour du score' }
      } as ServerMessage);
    }
  }

  private async handleMatchComplete(socket: any, data: { matchId: string }): Promise<void> {
    const referee = this.connectedReferees.get(socket.id);
    if (!referee) return;

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

  private async handleHeartbeat(socket: any): Promise<void> {
    const referee = this.connectedReferees.get(socket.id);
    if (referee) {
      referee.lastActivity = new Date();
      socket.emit('message', {
        type: 'session_update',
        data: { timestamp: new Date() }
      } as ServerMessage);
    }
  }

  private handleRefereeDisconnection(socket: any): void {
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

  private async createSession(competitionId: string, strips: number): Promise<RemoteSession> {
    const competition = this.db.getCompetition(competitionId);
    if (!competition) {
      throw new Error('Compétition non trouvée');
    }

    const session: RemoteSession = {
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

  private async updateMatchScore(matchId: string, update: RemoteScoreUpdate): Promise<void> {
    // Mettre à jour le match dans la base de données
    const match = this.db.getMatch(matchId);
    if (!match) {
      throw new Error('Match non trouvé');
    }

    const scoreA: Score = {
      value: update.scoreA,
      isVictory: update.winner === 'A',
      isAbstention: update.specialStatus === 'abandon' && update.winner !== 'A',
      isExclusion: update.specialStatus === 'exclusion' && update.winner !== 'A',
      isForfait: update.specialStatus === 'forfait' && update.winner !== 'A'
    };

    const scoreB: Score = {
      value: update.scoreB,
      isVictory: update.winner === 'B',
      isAbstention: update.specialStatus === 'abandon' && update.winner !== 'B',
      isExclusion: update.specialStatus === 'exclusion' && update.winner !== 'B',
      isForfait: update.specialStatus === 'forfait' && update.winner !== 'B'
    };

    this.db.updateMatch(matchId, {
      scoreA,
      scoreB,
      status: update.status === 'finished' ? MatchStatus.FINISHED : MatchStatus.IN_PROGRESS
    });
  }

  private broadcastMessage(message: WebSocketMessage, excludeSocketId?: string): void {
    this.connectedReferees.forEach((referee, socketId) => {
      if (socketId !== excludeSocketId) {
        const socket = Array.from(this.io.sockets.sockets.values()).find(s => s.id === socketId);
        if (socket) {
          socket.emit('message', message);
        }
      }
    });

    // Envoyer aussi à la fenêtre principale
    if ((global as any).mainWindow) {
      (global as any).mainWindow.webContents.send('remote:websocket_message', message);
    }
  }

  private generateRefereeCode(): string {
    const { randomBytes } = require('crypto');
    return randomBytes(4).toString('hex').substring(0, 6).toUpperCase();
  }

  private initializeArenas(): void {
    // Créer 4 arènes par défaut
    for (let i = 1; i <= 4; i++) {
      const arena: Arena = {
        id: `arena${i}`,
        name: `Arène ${i}`,
        number: i,
        currentMatch: null,
        status: 'idle',
        startTime: null,
        elapsedTime: 0,
        settings: {
          matchDuration: 180, // 3 minutes par défaut
          breakDuration: 30,  // 30 secondes entre les matchs
          autoAdvance: false
        }
      };
      this.arenas.set(arena.id, arena);
    }
  }

  // Méthodes publiques pour les arènes
  public getArena(arenaId: string): Arena | null {
    return this.arenas.get(arenaId) || null;
  }

  public getAllArenas(): Arena[] {
    return Array.from(this.arenas.values());
  }

  public updateArena(arenaId: string, update: Partial<Arena>): void {
    const arena = this.arenas.get(arenaId);
    if (!arena) return;

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

  public assignMatchToArena(arenaId: string, match: ArenaMatch): void {
    const arena = this.arenas.get(arenaId);
    if (!arena) return;

    arena.currentMatch = match;
    arena.status = 'ready';
    arena.elapsedTime = 0;
    
    this.updateArena(arenaId, {
      status: 'ready',
      elapsedTime: 0
    });
  }

  public startArenaMatch(arenaId: string): void {
    const arena = this.arenas.get(arenaId);
    if (!arena || !arena.currentMatch) return;

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

  public pauseArenaMatch(arenaId: string): void {
    const arena = this.arenas.get(arenaId);
    if (!arena) return;

    arena.status = 'ready';
    
    // Arrêter le chronomètre
    this.stopArenaTimer(arenaId);
    
    this.updateArena(arenaId, { status: 'ready' });
  }

  public updateArenaScore(arenaId: string, scoreA: number, scoreB: number): void {
    const arena = this.arenas.get(arenaId);
    if (!arena || !arena.currentMatch) return;

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

  public finishArenaMatch(arenaId: string): void {
    const arena = this.arenas.get(arenaId);
    if (!arena || !arena.currentMatch) return;

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

  private startArenaTimer(arenaId: string): void {
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

  private stopArenaTimer(arenaId: string): void {
    const timer = this.arenaTimers.get(arenaId);
    if (timer) {
      clearInterval(timer);
      this.arenaTimers.delete(arenaId);
    }
  }

  private broadcastArenaUpdate(arenaId: string, update: ArenaUpdate): void {
    // Envoyer via Socket.IO aux clients connectés aux arènes
    this.io.emit(`arena:${arenaId}:update`, update);
    
    // Envoyer aussi à la fenêtre principale
    if ((global as any).mainWindow) {
      (global as any).mainWindow.webContents.send('arena:update', { arenaId, update });
    }
  }

  private async loadNextMatch(arenaId: string): Promise<void> {
    // Logique pour charger le match suivant depuis les poules
    // À implémenter selon la logique de compétition
    const arena = this.arenas.get(arenaId);
    if (!arena) return;

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

  public start(): void {
    this.server.listen(this.port, () => {
      console.log(`Remote score server started on port ${this.port}`);
      console.log(`Arbitres peuvent se connecter sur: http://localhost:${this.port}`);
    });
  }

  public stop(): void {
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

  public getSession(): RemoteSession | null {
    return this.session;
  }

  public getConnectedReferees(): RemoteReferee[] {
    return Array.from(this.connectedReferees.values());
  }
}