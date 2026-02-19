/**
 * BellePoule Modern - Remote Score Entry Server
 * Web server for referees to enter scores remotely
 * Licensed under GPL-3.0
 */

import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import os from 'os';
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
  ArenaUpdate,
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
  private arenaCount: number = 4; // Nombre d'arènes par défaut

  constructor(db: DatabaseManager, port: number = 8066) {
    console.log('[RemoteScoreServer] Initialisation du serveur de saisie distante...');
    this.db = db;
    this.port = port;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
    this.initializeArenas();
    console.log(`[RemoteScoreServer] Serveur initialisé avec ${this.arenaCount} arènes`);
  }

  private setupMiddleware(): void {
    console.log('[RemoteScoreServer] Configuration du middleware...');
    this.app.use(express.json());

    // En développement, utiliser src/remote, en production utiliser dist/
    const remotePath =
      process.env.NODE_ENV === 'development'
        ? path.join(__dirname, '../../remote')
        : path.join(__dirname, '../remote');

    console.log('[RemoteScoreServer] Chemin des fichiers distants:', remotePath);
    console.log('[RemoteScoreServer] NODE_ENV:', process.env.NODE_ENV || 'production');

    // Vérifier que le dossier existe
    try {
      const fs = require('fs');
      if (fs.existsSync(remotePath)) {
        console.log('[RemoteScoreServer] Dossier distant trouvé ✓');
        const files = fs.readdirSync(remotePath);
        console.log('[RemoteScoreServer] Fichiers disponibles:', files);
      } else {
        console.error('[RemoteScoreServer] ERREUR: Dossier distant non trouvé!', remotePath);
      }
    } catch (err) {
      console.error('[RemoteScoreServer] ERREUR lors de la vérification du dossier:', err);
    }

    this.app.use(express.static(remotePath));

    this.app.use((req, res, next) => {
      console.log(`[RemoteScoreServer] ${req.method} ${req.url} - ${new Date().toISOString()}`);
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });
    console.log('[RemoteScoreServer] Middleware configuré ✓');
  }

  private setupRoutes(): void {
    console.log('[RemoteScoreServer] Configuration des routes...');

    // Route principale pour les arbitres
    this.app.get('/', (req, res) => {
      console.log('[RemoteScoreServer] Accès à la route principale /');
      const remotePath =
        process.env.NODE_ENV === 'development'
          ? path.join(__dirname, '../../remote/index.html')
          : path.join(__dirname, '../remote/index.html');

      console.log('[RemoteScoreServer] Envoi du fichier:', remotePath);
      res.sendFile(remotePath, (err: any) => {
        if (err) {
          console.error('[RemoteScoreServer] ERREUR envoi index.html:', err);
          res.status(500).send('Erreur lors du chargement de la page: ' + err.message);
        }
      });
    });

    // API endpoints
    this.app.get('/api/server-info', (req, res) => {
      res.json({
        url: this.getServerUrl(),
        ip: this.getLocalIPAddress(),
        port: this.port,
      });
    });

    // Get pending matches for a competition
    this.app.get('/api/competitions/:competitionId/pending-matches', (req, res) => {
      try {
        const { competitionId } = req.params;

        const pendingMatches = this.db.getPendingMatches(competitionId);
        res.json(pendingMatches);
      } catch (error) {
        console.error('Error getting pending matches:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des matchs' });
      }
    });

    this.app.get('/api/debug', (req, res) => {
      res.json({
        status: 'ok',
        session: this.session ? 'active' : 'inactive',
        serverTime: new Date().toISOString(),
        refereesCount: this.session?.referees.length || 0,
      });
    });

    this.app.get('/api/session', (req, res) => {
      console.log(
        '[RemoteScoreServer] GET /api/session - Session:',
        this.session ? 'active' : 'inactive'
      );
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

    // Pages d'arène - Dynamiques
    const getRemotePath = (filename: string) => {
      return process.env.NODE_ENV === 'development'
        ? path.join(__dirname, '../../remote', filename)
        : path.join(__dirname, '../remote', filename);
    };

    // Support both /arena1 and /arene1 formats
    this.app.get('/arena:arenaId', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à l'arène ${arenaId}`);

      res.sendFile(getRemotePath('arena.html'), (err: any) => {
        if (err) {
          console.error('[RemoteScoreServer] ERREUR envoi arena.html:', err);
          res.status(500).send('Erreur lors du chargement de la page arène');
        }
      });
    });

    // Alias /arene pour compatibilité française
    this.app.get('/arene:arenaId', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à l'arène (arene) ${arenaId}`);

      res.sendFile(getRemotePath('arena.html'), (err: any) => {
        if (err) {
          console.error('[RemoteScoreServer] ERREUR envoi arena.html:', err);
          res.status(500).send('Erreur lors du chargement de la page arène');
        }
      });
    });

    // Interface d'arbitrage - Dynamique (sans vérification d'existence)
    this.app.get('/arena:arenaId/referee', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à l'interface arbitre pour l'arène ${arenaId}`);

      res.sendFile(getRemotePath('referee.html'), (err: any) => {
        if (err) {
          console.error('[RemoteScoreServer] ERREUR envoi referee.html:', err);
          res.status(500).send("Erreur lors du chargement de l'interface arbitre");
        }
      });
    });

    // Alias /arene pour l'interface d'arbitrage (français)
    this.app.get('/arene:arenaId/referee', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(
        `[RemoteScoreServer] Accès à l'interface arbitre pour l'arène ${arenaId} (arene)`
      );

      res.sendFile(getRemotePath('referee.html'), (err: any) => {
        if (err) {
          console.error('[RemoteScoreServer] ERREUR envoi referee.html:', err);
          res.status(500).send("Erreur lors du chargement de l'interface arbitre");
        }
      });
    });

    // Alias /arbitre pour l'interface d'arbitrage
    this.app.get('/arbitre/:arenaId', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(
        `[RemoteScoreServer] Accès à l'interface arbitre (alias /arbitre) pour l'arène ${arenaId}`
      );

      res.sendFile(getRemotePath('referee.html'), (err: any) => {
        if (err) {
          console.error('[RemoteScoreServer] ERREUR envoi referee.html:', err);
          res.status(500).send("Erreur lors du chargement de l'interface arbitre");
        }
      });
    });

    // Nouveau: Route /arbitre/areneX (format demandé par l'utilisateur)
    this.app.get('/arbitre/arene:arenaId', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à l'interface arbitre /arbitre/arene${arenaId}`);

      res.sendFile(getRemotePath('referee.html'), (err: any) => {
        if (err) {
          console.error('[RemoteScoreServer] ERREUR envoi referee.html:', err);
          res.status(500).send("Erreur lors du chargement de l'interface arbitre");
        }
      });
    });

    // API pour récupérer les matchs d'une arène/poule
    this.app.get('/api/arenas/:arenaId/matches', (req, res) => {
      try {
        const { arenaId } = req.params;
        console.log(`[RemoteScoreServer] GET /api/arenas/${arenaId}/matches`);

        if (!this.session) {
          return res.status(404).json({ error: 'Aucune session active' });
        }

        // Récupérer l'arène
        const arena = this.getArena(arenaId);
        if (!arena) {
          return res.status(404).json({ error: 'Arène non trouvée' });
        }

        // Déterminer la pool associée à cette arène
        // Pour l'instant, on associe arena1 -> première pool, etc.
        const arenaNumber = parseInt(arenaId.replace('arena', ''));
        const competitionId = this.session.competitionId;

        // Récupérer toutes les pools de la compétition via SQL
        const pools: { id: string; name: string }[] = [];
        try {
          // Essayer d'abord via la table phases
          const phaseStmt = this.db['db'].prepare(`
            SELECT p.id, p.name FROM pools p
            INNER JOIN phases ph ON p.phase_id = ph.id
            WHERE ph.competition_id = ?
            ORDER BY p.name
          `);
          phaseStmt.bind([competitionId]);
          while (phaseStmt.step()) {
            const row = phaseStmt.getAsObject();
            pools.push({ id: row.id as string, name: row.name as string });
          }
          phaseStmt.free();
        } catch (e) {
          // Fallback: récupérer via pool_fencers
          try {
            const fallbackStmt = this.db['db'].prepare(`
              SELECT DISTINCT p.id, p.name FROM pools p
              INNER JOIN pool_fencers pf ON p.id = pf.pool_id
              INNER JOIN fencers f ON pf.fencer_id = f.id
              WHERE f.competition_id = ?
              ORDER BY p.name
            `);
            fallbackStmt.bind([competitionId]);
            while (fallbackStmt.step()) {
              const row = fallbackStmt.getAsObject();
              pools.push({ id: row.id as string, name: row.name as string });
            }
            fallbackStmt.free();
          } catch (e2) {
            console.warn('[RemoteScoreServer] Impossible de récupérer les pools:', e2);
          }
        }

        if (!pools || pools.length === 0) {
          return res.json({ matches: [], poolId: null });
        }

        // Associer l'arène à une pool (arena1 -> pool[0], arena2 -> pool[1], etc.)
        const poolIndex = Math.min(arenaNumber - 1, pools.length - 1);
        const pool = pools[poolIndex];

        if (!pool) {
          return res.json({ matches: [], poolId: null });
        }

        // Récupérer les matchs de cette pool
        const matches = this.db.getMatchesByPool(pool.id);
        console.log(`[RemoteScoreServer] ${matches.length} matchs trouvés pour la pool ${pool.id}`);

        res.json({ matches, poolId: pool.id });
      } catch (error) {
        console.error('[RemoteScoreServer] Erreur récupération matchs:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des matchs' });
      }
    });

    // API pour terminer un match avec enregistrement final
    this.app.post('/api/matches/:matchId/finish', async (req, res) => {
      try {
        const { matchId } = req.params;
        const { scoreA, scoreB, cardsA, cardsB } = req.body;

        console.log(`[RemoteScoreServer] POST /api/matches/${matchId}/finish`);
        console.log(`[RemoteScoreServer] Score final: ${scoreA}-${scoreB}`);

        // Mettre à jour le match dans la base de données
        const match = this.db.getMatch(matchId);
        if (!match) {
          return res.status(404).json({ error: 'Match non trouvé' });
        }

        // Déterminer le vainqueur
        const winner = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : null;

        // Créer les objets Score
        const scoreAObj = {
          value: scoreA,
          isVictory: winner === 'A',
          isAbstention: false,
          isExclusion: false,
          isForfait: false,
        };

        const scoreBObj = {
          value: scoreB,
          isVictory: winner === 'B',
          isAbstention: false,
          isExclusion: false,
          isForfait: false,
        };

        // Mettre à jour le match
        this.db.updateMatch(matchId, {
          scoreA: scoreAObj,
          scoreB: scoreBObj,
          status: MatchStatus.FINISHED,
        });

        // Notifier tous les clients
        this.broadcastMessage({
          type: 'match_finished',
          data: {
            matchId,
            scoreA,
            scoreB,
            winner,
            cardsA: cardsA || [],
            cardsB: cardsB || [],
          },
          timestamp: new Date(),
          sender: 'server',
        });

        console.log(`[RemoteScoreServer] Match ${matchId} terminé et enregistré`);
        res.json({ success: true, winner });
      } catch (error) {
        console.error('[RemoteScoreServer] Erreur fin de match:', error);
        res.status(500).json({ error: 'Erreur lors de la fin du match' });
      }
    });

    this.app.post('/api/referees', (req, res) => {
      console.log("[RemoteScoreServer] POST /api/referees - Ajout d'un arbitre");
      console.log('[RemoteScoreServer] Body:', req.body);
      console.log('[RemoteScoreServer] Session:', this.session ? 'active' : 'inactive');

      if (!this.session) {
        console.warn('[RemoteScoreServer] ERREUR: Aucune session active');
        return res.status(404).json({ error: 'Aucune session active' });
      }

      const name = req.body?.name;
      if (!name) {
        console.warn('[RemoteScoreServer] ERREUR: Nom manquant');
        return res.status(400).json({ error: "Nom de l'arbitre requis" });
      }

      const referee: RemoteReferee = {
        id: `ref_${Date.now()}`,
        name: name,
        code: req.body.code || this.generateRefereeCode(),
        isActive: true,
        lastActivity: new Date(),
      };

      this.session.referees.push(referee);
      console.log(`[RemoteScoreServer] Arbitre ajouté: ${referee.name} (code: ${referee.code})`);
      console.log(`[RemoteScoreServer] Total arbitres: ${this.session.referees.length}`);
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
          sender: 'server',
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
      socket.on('join_arena', (data: { arenaId: string; role?: string }) => {
        console.log(
          `Client ${socket.id} joining arena ${data.arenaId} as ${data.role || 'spectator'}`
        );
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
            fencerB: arena.currentMatch?.fencerB,
          });
        }
      });

      socket.on(
        'arena_control',
        (data: { arenaId: string; action: string; scoreA?: number; scoreB?: number }) => {
          this.handleArenaControl(socket, data);
        }
      );

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
      this.broadcastMessage(
        {
          type: 'referee_disconnected',
          data: { refereeId: referee.id, refereeName: referee.name },
          timestamp: new Date(),
          sender: 'server',
        },
        socket.id
      );

      console.log(`Referee ${referee.name} disconnected`);
    }

    this.connectedReferees.delete(socket.id);
  }

  // Stockage des cartons par arène
  private arenaCards: Map<string, { cardsA: string[]; cardsB: string[] }> = new Map();

  private handleArenaControl(
    socket: any,
    data: {
      arenaId: string;
      action: string;
      match?: ArenaMatch;
      scoreA?: number;
      scoreB?: number;
      time?: number;
      timerStatus?: 'running' | 'paused' | 'reset';
      fencer?: 'A' | 'B';
      cardType?: 'white' | 'yellow' | 'red';
      cardsA?: string[];
      cardsB?: string[];
    }
  ): void {
    const arena = this.getArena(data.arenaId);
    if (!arena) {
      socket.emit('error', { message: 'Arène non trouvée' });
      return;
    }

    switch (data.action) {
      case 'select_match':
        // Sélection d'un match par l'arbitre
        if (data.match) {
          this.assignMatchToArena(data.arenaId, data.match);
          // Réinitialiser les cartons
          this.arenaCards.set(data.arenaId, { cardsA: [], cardsB: [] });
        }
        break;
      case 'start':
        this.startArenaMatch(data.arenaId);
        break;
      case 'pause':
        this.pauseArenaMatch(data.arenaId);
        break;
      case 'finish':
        this.finishArenaMatch(data.arenaId);
        // Réinitialiser les cartons
        this.arenaCards.set(data.arenaId, { cardsA: [], cardsB: [] });
        break;
      case 'next':
        this.loadNextMatch(data.arenaId);
        // Réinitialiser les cartons
        this.arenaCards.set(data.arenaId, { cardsA: [], cardsB: [] });
        break;
      case 'update_score':
        if (data.scoreA !== undefined && data.scoreB !== undefined) {
          this.updateArenaScore(data.arenaId, data.scoreA, data.scoreB);
        }
        // Mettre à jour aussi les cartons si fournis
        if (data.cardsA !== undefined || data.cardsB !== undefined) {
          const currentCards = this.arenaCards.get(data.arenaId) || { cardsA: [], cardsB: [] };
          if (data.cardsA !== undefined) currentCards.cardsA = data.cardsA;
          if (data.cardsB !== undefined) currentCards.cardsB = data.cardsB;
          this.arenaCards.set(data.arenaId, currentCards);
          this.broadcastArenaUpdate(data.arenaId, {
            arenaId: data.arenaId,
            match: arena.currentMatch,
            scoreA: data.scoreA ?? arena.currentMatch?.scoreA,
            scoreB: data.scoreB ?? arena.currentMatch?.scoreB,
            cardsA: currentCards.cardsA,
            cardsB: currentCards.cardsB,
            status: arena.status,
          });
        }
        break;
      case 'add_card':
        // Gestion des cartons
        if (data.fencer && data.cardType) {
          const currentCards = this.arenaCards.get(data.arenaId) || { cardsA: [], cardsB: [] };
          const targetCards = data.fencer === 'A' ? currentCards.cardsA : currentCards.cardsB;
          targetCards.push(data.cardType);
          this.arenaCards.set(data.arenaId, currentCards);
          this.broadcastArenaUpdate(data.arenaId, {
            arenaId: data.arenaId,
            match: arena.currentMatch,
            scoreA: arena.currentMatch?.scoreA,
            scoreB: arena.currentMatch?.scoreB,
            cardsA: currentCards.cardsA,
            cardsB: currentCards.cardsB,
            status: arena.status,
          });
        }
        break;
      case 'reset_scores':
        if (arena.currentMatch) {
          this.updateArenaScore(data.arenaId, 0, 0);
          // Réinitialiser les cartons
          this.arenaCards.set(data.arenaId, { cardsA: [], cardsB: [] });
          this.broadcastArenaUpdate(data.arenaId, {
            arenaId: data.arenaId,
            match: arena.currentMatch,
            scoreA: 0,
            scoreB: 0,
            cardsA: [],
            cardsB: [],
            status: arena.status,
          });
        }
        break;
      case 'update_timer':
      case 'pause_timer':
      case 'reset_timer':
        // Relay timer updates to arena display
        this.broadcastArenaUpdate(data.arenaId, {
          arenaId: data.arenaId,
          match: arena.currentMatch,
          time: data.time,
          timerStatus: data.timerStatus,
          status: arena.status,
        });
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
        data: { error: 'Aucune session active' },
      } as ServerMessage);
      return;
    }

    const referee = this.session.referees.find(r => r.code === data.code);
    if (!referee) {
      socket.emit('message', {
        type: 'login_error',
        data: { error: "Code d'arbitre invalide" },
      } as ServerMessage);
      return;
    }

    referee.isActive = true;
    referee.lastActivity = new Date();
    this.connectedReferees.set(socket.id, referee);

    socket.emit('message', {
      type: 'login_success',
      data: { referee },
    } as ServerMessage);

    // Notifier les autres clients
    this.broadcastMessage(
      {
        type: 'referee_connected',
        data: { refereeId: referee.id, refereeName: referee.name },
        timestamp: new Date(),
        sender: 'server',
      },
      socket.id
    );

    console.log(`Referee ${referee.name} connected with code ${data.code}`);
  }

  private async handleScoreUpdate(socket: any, data: RemoteScoreUpdate): Promise<void> {
    try {
      const referee = this.connectedReferees.get(socket.id);
      if (!referee) {
        socket.emit('message', {
          type: 'error',
          data: { error: 'Non authentifié' },
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
        sender: referee.id,
      });
    } catch (error) {
      console.error('Error handling score update:', error);
      socket.emit('message', {
        type: 'error',
        data: { error: 'Erreur lors de la mise à jour du score' },
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
      sender: referee.id,
    });
  }

  private async handleHeartbeat(socket: any): Promise<void> {
    const referee = this.connectedReferees.get(socket.id);
    if (referee) {
      referee.lastActivity = new Date();
      socket.emit('message', {
        type: 'session_update',
        data: { timestamp: new Date() },
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
        sender: 'server',
      });
    }
  }

  private async createSession(competitionId: string, strips: number): Promise<RemoteSession> {
    console.log(
      `[RemoteScoreServer] Création d'une session pour la compétition ${competitionId} avec ${strips} pistes...`
    );

    const competition = this.db.getCompetition(competitionId);
    if (!competition) {
      console.error(`[RemoteScoreServer] ERREUR: Compétition ${competitionId} non trouvée`);
      throw new Error('Compétition non trouvée');
    }
    console.log(`[RemoteScoreServer] Compétition trouvée: ${competition.title}`);

    // Le nombre de pistes est déjà défini côté client en fonction du nombre de poules
    // On l'utilise directement pour configurer les arènes
    console.log(`[RemoteScoreServer] Configuration du nombre d'arènes: ${strips}`);
    this.setArenaCount(strips);

    // Récupérer les matchs en attente et les assigner aux arènes
    const pendingMatches = this.db.getPendingMatches(competitionId);
    console.log(`[RemoteScoreServer] ${pendingMatches.length} matchs en attente trouvés`);

    // Assigner les matchs en attente aux arènes
    pendingMatches.slice(0, strips).forEach((match, index) => {
      const arenaId = `arena${index + 1}`;
      const arenaMatch: ArenaMatch = {
        id: match.id,
        poolId: match.poolId || '',
        fencerA: match.fencerA!,
        fencerB: match.fencerB!,
        scoreA: match.scoreA?.value ?? 0,
        scoreB: match.scoreB?.value ?? 0,
        status: match.status === 'in_progress' ? 'in_progress' : 'pending',
        startTime: match.status === 'in_progress' ? new Date() : null,
        endTime: null,
      };
      this.assignMatchToArena(arenaId, arenaMatch);
      console.log(`[RemoteScoreServer] Match ${match.id} assigné à l'arène ${arenaId}`);
    });

    const session: RemoteSession = {
      competitionId,
      strips: Array.from({ length: strips }, (_, i) => ({
        number: i + 1,
        status: pendingMatches[i] ? 'occupied' : 'available',
      })),
      referees: [],
      activeMatches: [],
      isRunning: true,
      startTime: new Date(),
    };

    console.log(`[RemoteScoreServer] Session créée avec succès ✓`);
    console.log(
      `[RemoteScoreServer] Détails: ${strips} pistes, ${session.referees.length} arbitres`
    );
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
      isForfait: update.specialStatus === 'forfait' && update.winner !== 'A',
    };

    const scoreB: Score = {
      value: update.scoreB,
      isVictory: update.winner === 'B',
      isAbstention: update.specialStatus === 'abandon' && update.winner !== 'B',
      isExclusion: update.specialStatus === 'exclusion' && update.winner !== 'B',
      isForfait: update.specialStatus === 'forfait' && update.winner !== 'B',
    };

    this.db.updateMatch(matchId, {
      scoreA,
      scoreB,
      status: update.status === 'finished' ? MatchStatus.FINISHED : MatchStatus.IN_PROGRESS,
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
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private initializeArenas(arenaCount: number = 4): void {
    this.arenaCount = arenaCount;
    console.log(`[RemoteScoreServer] Initialisation de ${arenaCount} arènes...`);
    this.arenas.clear();

    for (let i = 1; i <= arenaCount; i++) {
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
          breakDuration: 30, // 30 secondes entre les matchs
          autoAdvance: false,
        },
      };
      this.arenas.set(arena.id, arena);
      console.log(`[RemoteScoreServer] Arène ${i} créée ✓`);
    }
    console.log(`[RemoteScoreServer] ${arenaCount} arènes initialisées avec succès ✓`);
  }

  // Méthode publique pour mettre à jour le nombre d'arènes
  public setArenaCount(count: number): void {
    console.log(`[RemoteScoreServer] Mise à jour du nombre d'arènes: ${count}`);
    this.initializeArenas(count);
  }

  public getArenaCount(): number {
    return this.arenaCount;
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
      fencerB: arena.currentMatch?.fencerB,
    });
  }

  public assignMatchToArena(arenaId: string, match: ArenaMatch): void {
    console.log(
      `[RemoteScoreServer] assignMatchToArena called: arenaId=${arenaId}, matchId=${match.id}`
    );
    const arena = this.arenas.get(arenaId);
    if (!arena) {
      console.error(`[RemoteScoreServer] ERREUR: Arène ${arenaId} n'existe pas!`);
      return;
    }

    arena.currentMatch = match;
    arena.status = 'ready';
    arena.elapsedTime = 0;

    this.updateArena(arenaId, {
      status: 'ready',
      elapsedTime: 0,
      currentMatch: match,
    });

    console.log(`[RemoteScoreServer] Match assigné avec succès à l'arène ${arenaId}`);
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
      currentMatch: arena.currentMatch,
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
      status: arena.status,
    });
  }

  public finishArenaMatch(arenaId: string): void {
    const arena = this.arenas.get(arenaId);
    if (!arena || !arena.currentMatch) return;

    arena.status = 'finished';
    arena.currentMatch.status = 'finished';
    arena.currentMatch.endTime = new Date();

    if (arena.startTime) {
      arena.currentMatch.duration = Math.floor(
        (new Date().getTime() - arena.startTime.getTime()) / 1000
      );
    }

    // Arrêter le chronomètre
    this.stopArenaTimer(arenaId);

    this.updateArena(arenaId, {
      status: 'finished',
      currentMatch: arena.currentMatch,
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
        status: arena.status,
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
      startTime: null,
    });
  }

  public getLocalIPAddress(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        // Ignorer les adresses internes (loopback) et IPv6
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }

  public getServerUrl(): string {
    const ip = this.getLocalIPAddress();
    return `http://${ip}:${this.port}`;
  }

  public start(): void {
    console.log('[RemoteScoreServer] Démarrage du serveur...');
    console.log(`[RemoteScoreServer] Port: ${this.port}`);
    console.log(`[RemoteScoreServer] Interface: 0.0.0.0 (toutes les interfaces)`);
    console.log(`[RemoteScoreServer] URL locale: http://localhost:${this.port}`);
    console.log(`[RemoteScoreServer] URL réseau: http://${this.getLocalIPAddress()}:${this.port}`);

    this.server.listen(this.port, '0.0.0.0', () => {
      const url = this.getServerUrl();
      console.log(`[RemoteScoreServer] ============================================`);
      console.log(`[RemoteScoreServer] SERVEUR DÉMARRÉ AVEC SUCCÈS ✓`);
      console.log(`[RemoteScoreServer] Port: ${this.port}`);
      console.log(`[RemoteScoreServer] URL: ${url}`);
      console.log(`[RemoteScoreServer] Arènes disponibles: ${this.arenaCount}`);
      console.log(`[RemoteScoreServer] ============================================`);
      console.log(`[RemoteScoreServer] Les arbitres peuvent se connecter sur: ${url}`);
    });

    // Gestion des erreurs du serveur
    this.server.on('error', (err: any) => {
      console.error('[RemoteScoreServer] ERREUR DU SERVEUR:', err);
      if (err.code === 'EADDRINUSE') {
        console.error(`[RemoteScoreServer] Le port ${this.port} est déjà utilisé!`);
        console.error("[RemoteScoreServer] Arrêtez l'autre instance ou utilisez un autre port.");
      }
    });
  }

  public stop(): void {
    if (this.server) {
      this.server.close();
      console.log('Remote score server stopped');
    }
  }

  public async startSession(competitionId: string, strips: number): Promise<RemoteSession> {
    if (this.session) {
      throw new Error('Session déjà active');
    }

    const competition = this.db.getCompetition(competitionId);
    if (!competition) {
      throw new Error('Compétition non trouvée');
    }

    // Configurer le nombre d'arènes
    this.setArenaCount(strips);

    // Récupérer les matchs en attente
    const pendingMatches = this.db.getPendingMatches(competitionId);
    console.log(
      `[RemoteScoreServer] ${pendingMatches.length} matchs en attente trouvés pour la compétition ${competitionId}`
    );

    // Si pas de matchs trouvés via getPendingMatches (phases), essayer de récupérer via pool_fencers
    let allMatches = pendingMatches;
    if (pendingMatches.length === 0) {
      console.log('[RemoteScoreServer] Tentative de récupération des matchs via pool_fencers...');
      allMatches = this.db.getAllPendingMatchesFromPools(competitionId);
      console.log(`[RemoteScoreServer] ${allMatches.length} matchs trouvés via fallback`);
    }

    // Assigner les matchs aux arènes
    console.log(
      `[RemoteScoreServer] Assignation de ${Math.min(allMatches.length, strips)} matchs à ${strips} arènes`
    );

    allMatches.slice(0, strips).forEach((match, index) => {
      const arenaId = `arena${index + 1}`;
      console.log(
        `[RemoteScoreServer] Vérification arena ${arenaId}:`,
        this.arenas.has(arenaId) ? 'existe' : 'N EXISTE PAS'
      );

      const arenaMatch: ArenaMatch = {
        id: match.id,
        poolId: match.poolId || '',
        fencerA: match.fencerA!,
        fencerB: match.fencerB!,
        scoreA: match.scoreA?.value ?? 0,
        scoreB: match.scoreB?.value ?? 0,
        status: match.status === 'in_progress' ? 'in_progress' : 'pending',
        startTime: match.status === 'in_progress' ? new Date() : null,
        endTime: null,
      };

      console.log(
        `[RemoteScoreServer] Match à assigner: ID=${match.id}, Pool=${match.poolId}, FencerA=${match.fencerA?.lastName}, FencerB=${match.fencerB?.lastName}`
      );

      this.assignMatchToArena(arenaId, arenaMatch);
      console.log(
        `[RemoteScoreServer] Match ${match.id} assigné à l'arène ${arenaId} (Poule ${match.poolId})`
      );
    });

    // Créer la session - utiliser allMatches au lieu de pendingMatches
    const assignedMatchCount = Math.min(allMatches.length, strips);
    this.session = {
      competitionId,
      strips: Array.from({ length: strips }, (_, i) => ({
        number: i + 1,
        status: i < assignedMatchCount ? 'occupied' : 'available',
      })),
      referees: [],
      activeMatches: [],
      isRunning: true,
      startTime: new Date(),
    };

    console.log(`[RemoteScoreServer] Session créée avec ${assignedMatchCount} matchs assignés`);

    return this.session;
  }

  public stopSession(): void {
    this.session = null;
    this.connectedReferees.clear();
  }

  public updateStripCount(newCount: number): RemoteSession | null {
    if (!this.session) {
      throw new Error('Aucune session active');
    }

    const currentCount = this.session.strips.length;

    if (newCount > currentCount) {
      // Add new strips
      for (let i = currentCount; i < newCount; i++) {
        this.session.strips.push({
          number: i + 1,
          status: 'available',
        });
      }
    } else if (newCount < currentCount) {
      // Remove strips (only available ones)
      const availableStrips = this.session.strips.filter(s => s.status === 'available');
      const toRemove = currentCount - newCount;

      if (availableStrips.length < toRemove) {
        throw new Error(
          `Impossible de réduire à ${newCount} pistes: ${toRemove - availableStrips.length} pistes occupées`
        );
      }

      // Remove from the end (available ones)
      let removed = 0;
      for (let i = this.session.strips.length - 1; i >= 0 && removed < toRemove; i--) {
        if (this.session.strips[i].status === 'available') {
          this.session.strips.splice(i, 1);
          removed++;
        }
      }

      // Renumber strips
      this.session.strips.forEach((strip, idx) => {
        strip.number = idx + 1;
      });
    }

    return this.session;
  }

  public addReferee(name: string): RemoteReferee {
    if (!this.session) {
      throw new Error('Aucune session active');
    }

    const code = `ARB${String(this.session.referees.length + 1).padStart(3, '0')}`;
    const referee: RemoteReferee = {
      id: `ref-${Date.now()}`,
      name,
      code,
      isActive: false,
      lastActivity: new Date(),
    };

    this.session.referees.push(referee);
    return referee;
  }

  public getSession(): RemoteSession | null {
    return this.session;
  }

  public getConnectedReferees(): RemoteReferee[] {
    return Array.from(this.connectedReferees.values());
  }
}
