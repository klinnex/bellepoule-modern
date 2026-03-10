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
  RemoteScoreUpdate,
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
  private arenas: Map<string, Arena> = new Map();
  private arenaCount: number = 4; // Nombre d'arènes par défaut
  private sessionWeapon: string | null = null; // Type d'arme de la compétition (L = Laser)
  private sessionMatches: any[] = []; // Matches passés depuis le renderer
  private arenaNextMatchIndex: Map<string, number> = new Map(); // Index du prochain match par arène
  private arenaMatchQueue: Map<string, ArenaMatch[]> = new Map(); // File d'attente DE par arène

  // Stocker le contenu des fichiers HTML en mémoire pour éviter les problèmes de chemin
  private htmlFiles: Map<string, string> = new Map();

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

    // Charger les fichiers HTML en mémoire au démarrage
    this.loadHtmlFiles();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
    this.initializeArenas();
    console.log(`[RemoteScoreServer] Serveur initialisé avec ${this.arenaCount} arènes`);
  }

  // Charger les fichiers HTML en mémoire pour éviter les problèmes de chemin
  private loadHtmlFiles(): void {
    const fs = require('fs');
    const isDev = process.env.NODE_ENV === 'development';

    // Liste des fichiers à charger
    const filesToLoad = ['referee.html', 'arena.html', 'dashboard.html', 'index.html'];

    // Essayer plusieurs chemins pour trouver les fichiers
    const possiblePaths = isDev
      ? [path.join(__dirname, '../../remote')]
      : [
          path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'remote'),
          path.join(__dirname, '..', 'remote').replace('app.asar', 'app.asar.unpacked'),
          path.join(__dirname, '..', 'remote'),
        ];

    console.log('[RemoteScoreServer] Chargement des fichiers HTML...');

    for (const basePath of possiblePaths) {
      console.log(`[RemoteScoreServer] Essai chemin: ${basePath}`);

      try {
        if (fs.existsSync(basePath)) {
          console.log(`[RemoteScoreServer] Chemin trouvé: ${basePath}`);

          for (const file of filesToLoad) {
            const filePath = path.join(basePath, file);
            if (fs.existsSync(filePath)) {
              this.htmlFiles.set(file, fs.readFileSync(filePath, 'utf-8'));
              console.log(`[RemoteScoreServer] Chargé: ${file}`);
            } else {
              console.log(`[RemoteScoreServer] Fichier non trouvé: ${filePath}`);
            }
          }

          // Si on a chargé au moins un fichier, on utilise ce chemin
          if (this.htmlFiles.size > 0) {
            console.log(
              `[RemoteScoreServer] ${this.htmlFiles.size} fichiers chargés depuis: ${basePath}`
            );
            break;
          }
        }
      } catch (err) {
        console.error(`[RemoteScoreServer] Erreur avec chemin ${basePath}:`, err);
      }
    }

    if (this.htmlFiles.size === 0) {
      console.error('[RemoteScoreServer] ERREUR: Aucun fichier HTML chargé!');
    } else {
      console.log(
        `[RemoteScoreServer] Chargement terminé: ${Array.from(this.htmlFiles.keys()).join(', ')}`
      );
    }
  }

  // Servir un fichier HTML depuis la mémoire
  private sendHtmlFromMemory(filename: string, res: express.Response): void {
    const html = this.htmlFiles.get(filename);
    if (html) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      console.error(`[RemoteScoreServer] ERREUR: Fichier ${filename} non trouvé en mémoire`);
      res.status(500).send(`Erreur: fichier ${filename} non trouvé`);
    }
  }

  private setupMiddleware(): void {
    console.log('[RemoteScoreServer] Configuration du middleware...');
    this.app.use(express.json());

    // Déterminer le chemin des fichiers remote
    let remotePath: string;
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      // En développement
      remotePath = path.join(__dirname, '../../remote');
    } else {
      // En production - utiliser process.resourcesPath qui est plus fiable
      // Les fichiers unpacked sont dans resourcesPath/app.asar.unpacked/dist/remote
      // __dirname est dans resourcesPath/app.asar/dist/main/

      // Essayer plusieurs chemins possibles
      const possiblePaths = [
        // Chemin standard avec asarUnpack
        path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'remote'),
        // Chemin relatif depuis __dirname
        path.join(__dirname, '..', 'remote').replace('app.asar', 'app.asar.unpacked'),
        // Dernier recours: chemin relatif standard
        path.join(__dirname, '..', 'remote'),
      ];

      remotePath = '';
      const fs = require('fs');
      for (const p of possiblePaths) {
        console.log(`[RemoteScoreServer] Vérification chemin: ${p}`);
        if (fs.existsSync(p)) {
          remotePath = p;
          console.log(`[RemoteScoreServer] Chemin valide trouvé: ${p}`);
          break;
        }
      }

      if (!remotePath) {
        console.error('[RemoteScoreServer] ERREUR: Aucun chemin valide trouvé!');
        console.error('[RemoteScoreServer] Chemins testés:', possiblePaths);
        // Utiliser le dernier chemin comme fallback
        remotePath = possiblePaths[possiblePaths.length - 1];
      }
    }

    console.log('[RemoteScoreServer] Chemin des fichiers distants:', remotePath);
    console.log('[RemoteScoreServer] NODE_ENV:', process.env.NODE_ENV || 'production');
    console.log('[RemoteScoreServer] __dirname:', __dirname);
    console.log('[RemoteScoreServer] process.resourcesPath:', process.resourcesPath);

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
      const isDev = process.env.NODE_ENV === 'development';

      let remotePath = '';
      if (isDev) {
        remotePath = path.join(__dirname, '../../remote/index.html');
      } else {
        // Essayer plusieurs chemins possibles
        const possiblePaths = [
          path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'remote', 'index.html'),
          path
            .join(__dirname, '..', 'remote', 'index.html')
            .replace('app.asar', 'app.asar.unpacked'),
          path.join(__dirname, '..', 'remote', 'index.html'),
        ];

        const fs = require('fs');
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            remotePath = p;
            break;
          }
        }
        if (!remotePath) remotePath = possiblePaths[possiblePaths.length - 1];
      }

      console.log('[RemoteScoreServer] Envoi du fichier:', remotePath);
      this.sendHtmlFromMemory('index.html', res);
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
      res.json({ success: true });
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

    // Get all pools for current competition
    this.app.get('/api/pools', (req, res) => {
      if (!this.session) {
        return res.status(404).json({ error: 'Aucune session active' });
      }
      try {
        const pools = this.db.getCompetitionPools(this.session.competitionId);
        res.json(pools);
      } catch (error) {
        console.error('Error getting pools:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des poules' });
      }
    });

    // Get matches for a specific pool
    this.app.get('/api/pools/:poolId/matches', (req, res) => {
      const { poolId } = req.params;
      try {
        const matches = this.db.getMatchesByPool(poolId);
        res.json(matches);
      } catch (error) {
        console.error('Error getting pool matches:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des matchs' });
      }
    });

    // Get pending matches for a specific pool
    this.app.get('/api/pools/:poolId/pending-matches', (req, res) => {
      const { poolId } = req.params;
      try {
        const matches = this.db.getMatchesByPool(poolId);
        const pending = matches.filter(
          m => m.status === 'not_started' || m.status === 'in_progress'
        );
        res.json(pending);
      } catch (error) {
        console.error('Error getting pending matches:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des matchs' });
      }
    });

    // Pages d'arène - Dynamiques
    const getRemotePath = (filename: string) => {
      const isDev = process.env.NODE_ENV === 'development';

      if (isDev) {
        return path.join(__dirname, '../../remote', filename);
      } else {
        // Essayer plusieurs chemins possibles (comme dans setupMiddleware)
        const possiblePaths = [
          path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'remote', filename),
          path.join(__dirname, '..', 'remote', filename).replace('app.asar', 'app.asar.unpacked'),
          path.join(__dirname, '..', 'remote', filename),
        ];

        const fs = require('fs');
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            return p;
          }
        }

        // Retourner le dernier chemin comme fallback
        return possiblePaths[possiblePaths.length - 1];
      }
    };

    // Support both /arena1 and /arene1 formats
    this.app.get('/arena:arenaId', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à l'arène ${arenaId}`);

      this.sendHtmlFromMemory('arena.html', res);
    });

    // Alias /arene pour compatibilité française
    this.app.get('/arene:arenaId', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à l'arène (arene) ${arenaId}`);

      this.sendHtmlFromMemory('arena.html', res);
    });

    // Interface d'arbitrage - Dynamique (sans vérification d'existence)
    this.app.get('/arena:arenaId/referee', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à l'interface arbitre pour l'arène ${arenaId}`);

      this.sendHtmlFromMemory('referee.html', res);
    });

    // Alias /arene pour l'interface d'arbitrage (français)
    this.app.get('/arene:arenaId/referee', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(
        `[RemoteScoreServer] Accès à l'interface arbitre pour l'arène ${arenaId} (arene)`
      );

      this.sendHtmlFromMemory('referee.html', res);
    });

    // Alias /arbitre pour l'interface d'arbitrage
    this.app.get('/arbitre/:arenaId', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(
        `[RemoteScoreServer] Accès à l'interface arbitre (alias /arbitre) pour l'arène ${arenaId}`
      );

      this.sendHtmlFromMemory('referee.html', res);
    });

    // Nouveau: Route /arbitre/areneX (format demandé par l'utilisateur)
    this.app.get('/arbitre/arene:arenaId', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à l'interface arbitre /arbitre/arene${arenaId}`);

      this.sendHtmlFromMemory('referee.html', res);
    });

    // Route /areneX/arbitre (format français demandé)
    this.app.get('/arene:arenaId/arbitre', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à l'interface arbitre /arene${arenaId}/arbitre`);

      this.sendHtmlFromMemory('referee.html', res);
    });

    // API pour récupérer les matchs d'une arène/poule
    this.app.get('/api/arenas/:arenaId/matches', (req, res) => {
      try {
        const { arenaId } = req.params;
        console.log(`[RemoteScoreServer] GET /api/arenas/${arenaId}/matches`);

        if (!this.session) {
          console.log('[RemoteScoreServer] Pas de session active');
          return res.status(404).json({ error: 'Aucune session active' });
        }

        const competitionId = this.session.competitionId;
        console.log(`[RemoteScoreServer] CompetitionId: ${competitionId}`);

        // D'abord, essayer de récupérer les matches depuis la mémoire (arènes)
        const arena = this.arenas.get(arenaId);
        const allArenaMatches: any[] = [];

        if (arena && arena.currentMatch) {
          console.log(
            `[RemoteScoreServer] Match trouvé en mémoire pour arène ${arenaId}:`,
            arena.currentMatch.id
          );
          allArenaMatches.push({
            id: arena.currentMatch.id,
            poolId: arena.currentMatch.poolId,
            fencerA: arena.currentMatch.fencerA,
            fencerB: arena.currentMatch.fencerB,
            scoreA: arena.currentMatch.scoreA,
            scoreB: arena.currentMatch.scoreB,
            status: arena.currentMatch.status,
          });
        } else {
          console.log(`[RemoteScoreServer] Pas de match en mémoire pour arène ${arenaId}`);
        }

        // Récupérer tous les matches de toutes les arènes
        for (const [id, a] of this.arenas) {
          if (a.currentMatch && id !== arenaId) {
            allArenaMatches.push({
              id: a.currentMatch.id,
              poolId: a.currentMatch.poolId,
              fencerA: a.currentMatch.fencerA,
              fencerB: a.currentMatch.fencerB,
              scoreA: a.currentMatch.scoreA,
              scoreB: a.currentMatch.scoreB,
              status: a.currentMatch.status,
            });
          }
        }

        console.log(`[RemoteScoreServer] Total matches en mémoire: ${allArenaMatches.length}`);

        // Si on a des matches en mémoire, les utiliser
        if (allArenaMatches.length > 0) {
          console.log(`[RemoteScoreServer] Utilisation des matches en mémoire`);
          return res.json({ matches: allArenaMatches, poolId: null, poolName: null });
        }

        // Fallback: chercher dans la DB si pas de matches en mémoire
        console.log('[RemoteScoreServer] Pas de matches en mémoire, recherche dans la DB...');
        let allMatches = this.db.getPendingMatches(competitionId);
        console.log(
          `[RemoteScoreServer] Methode 1 (getPendingMatches): ${allMatches.length} matches`
        );

        // Fallback if no matches found - via pool_fencers
        if (allMatches.length === 0) {
          allMatches = this.db.getAllPendingMatchesFromPools(competitionId);
          console.log(
            `[RemoteScoreServer] Methode 2 (getAllPendingMatchesFromPools): ${allMatches.length} matches`
          );
        }

        // Fallback 2 - direct query via fencers table
        if (allMatches.length === 0) {
          allMatches = this.db.getPendingMatchesDirectly(competitionId);
          console.log(
            `[RemoteScoreServer] Methode 3 (getPendingMatchesDirectly): ${allMatches.length} matches`
          );
        }

        console.log(
          `[RemoteScoreServer] Total: ${allMatches.length} matches en attente pour la compétition ${competitionId}`
        );

        res.json({ matches: allMatches, poolId: null, poolName: null });
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
    console.log(`Client ${socket.id} disconnected`);
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
          const m = data.match;
          const rawA = m.scoreA as unknown;
          const rawB = m.scoreB as unknown;
          this.assignMatchToArena(data.arenaId, {
            ...m,
            scoreA: rawA !== null && typeof rawA === 'object' ? ((rawA as { value?: number }).value ?? 0) : ((rawA as number) ?? 0),
            scoreB: rawB !== null && typeof rawB === 'object' ? ((rawB as { value?: number }).value ?? 0) : ((rawB as number) ?? 0),
          });
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

  private broadcastMessage(message: WebSocketMessage): void {
    // Envoyer à la fenêtre principale
    if ((global as any).mainWindow) {
      (global as any).mainWindow.webContents.send('remote:websocket_message', message);
    }
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
        settings: {
          matchDuration: 180, // 3 minutes par défaut
          breakDuration: 30, // 30 secondes entre les matchs
          autoAdvance: false,
        },
      };
      this.arenas.set(arena.id, arena);
      this.arenaMatchQueue.set(arena.id, []);
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

    this.updateArena(arenaId, {
      status: 'ready',
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

    this.updateArena(arenaId, { status: 'ready' });
  }

  public updateArenaScore(arenaId: string, scoreA: number, scoreB: number): void {
    const arena = this.arenas.get(arenaId);
    if (!arena || !arena.currentMatch) return;

    // Ignorer si le match est terminé
    if (arena.status === 'finished' || arena.currentMatch.status === 'finished') {
      console.log(
        `[RemoteScoreServer] Match terminé, mise à jour du score ignorée pour arène ${arenaId}`
      );
      return;
    }

    const previousScoreA = arena.currentMatch.scoreA;
    const previousScoreB = arena.currentMatch.scoreB;

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

    // Vérifier si le match doit s'arrêter automatiquement en Laser Sabre
    this.checkAndAutoFinishMatch(arenaId, scoreA, scoreB, previousScoreA, previousScoreB);
  }

  private checkAndAutoFinishMatch(
    arenaId: string,
    scoreA: number,
    scoreB: number,
    previousScoreA: number,
    previousScoreB: number
  ): void {
    const arena = this.arenas.get(arenaId);
    if (!arena || arena.status === 'finished' || !arena.currentMatch) return;

    // Vérifier si c'est le mode Laser Sabre
    if (this.sessionWeapon !== 'L') return;

    // Vérifier si un tireur vient d'atteindre 15 points
    const SCORE_LIMIT_LASER = 15;
    const scoreReached15A = scoreA >= SCORE_LIMIT_LASER && previousScoreA < SCORE_LIMIT_LASER;
    const scoreReached15B = scoreB >= SCORE_LIMIT_LASER && previousScoreB < SCORE_LIMIT_LASER;

    if (scoreReached15A || scoreReached15B) {
      console.log(
        `[RemoteScoreServer] Score de ${SCORE_LIMIT_LASER} atteint en Laser Sabre - Signal score_limit_reached envoyé à l'arbitre`
      );

      // Signaler la tablette arbitre pour afficher la fenêtre de confirmation
      this.io.emit(`arena:${arenaId}:score_limit_reached`, { scoreA, scoreB });
    }
  }

  public finishArenaMatch(arenaId: string): void {
    const arena = this.arenas.get(arenaId);
    if (!arena || !arena.currentMatch) return;

    const finishedMatch = { ...arena.currentMatch };

    arena.status = 'finished';
    arena.currentMatch.status = 'finished';
    arena.currentMatch.endTime = new Date();

    if (arena.startTime) {
      arena.currentMatch.duration = Math.floor(
        (new Date().getTime() - arena.startTime.getTime()) / 1000
      );
    }

    this.updateArena(arenaId, {
      status: 'finished',
      currentMatch: arena.currentMatch,
    });

    // Émettre l'event pour le renderer (pour sauvegarder le score dans les pools)
    const mainWindow = (global as any).mainWindow;
    if (mainWindow) {
      mainWindow.webContents.send('match:finished', {
        matchId: finishedMatch.id,
        scoreA: finishedMatch.scoreA,
        scoreB: finishedMatch.scoreB,
        poolId: finishedMatch.poolId,
      });
      console.log(
        `[RemoteScoreServer] Émission match:finished pour ${finishedMatch.id}: ${finishedMatch.scoreA}-${finishedMatch.scoreB}`
      );
    }

    // Remettre l'arène en état idle après un délai (l'arbitre choisit le prochain match manuellement)
    setTimeout(() => {
      const a = this.arenas.get(arenaId);
      if (a && a.status === 'finished') {
        a.currentMatch = null;
        a.status = 'idle';
        a.startTime = null;
        this.updateArena(arenaId, { currentMatch: null, status: 'idle', startTime: null });
      }
    }, 3000);
  }

  private loadNextMatch(arenaId: string): void {
    const arena = this.arenas.get(arenaId);
    if (!arena || !this.session) {
      console.log(
        `[RemoteScoreServer] Impossible de charger le match suivant: arène ou session invalide`
      );
      return;
    }

    const currentMatchId = arena.currentMatch?.id;
    const currentPoolId = arena.currentMatch?.poolId;
    const nextIndex = this.arenaNextMatchIndex.get(arenaId) || 0;

    console.log(
      `[RemoteScoreServer] loadNextMatch: arena=${arenaId}, pool=${currentPoolId}, index=${nextIndex}, total=${this.sessionMatches.length}`
    );

    // Si pas de matches en mémoire, essayer la DB
    if (this.sessionMatches.length === 0) {
      console.log('[RemoteScoreServer] Pas de matches en mémoire, recherche dans la DB...');
      const pendingMatches = this.db.getPendingMatches(this.session.competitionId);
      if (pendingMatches.length === 0) {
        console.log('[RemoteScoreServer] Pas de matches non plus en DB');
        arena.currentMatch = null;
        arena.status = 'idle';
        this.updateArena(arenaId, { currentMatch: null, status: 'idle' });
        return;
      }
      // Ajouter les matches de la DB à sessionMatches
      this.sessionMatches = pendingMatches;
    }

    // Chercher le prochain match dans le même pool
    if (currentPoolId) {
      const poolMatches = this.sessionMatches.filter(m => {
        const matchPoolId = m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`;
        return matchPoolId === currentPoolId;
      });

      console.log(
        `[RemoteScoreServer] ${poolMatches.length} matches dans le pool ${currentPoolId}, prochain index: ${nextIndex}`
      );

      if (nextIndex < poolMatches.length) {
        const nextMatch = poolMatches[nextIndex];

        // Ignorer le match actuel
        if (nextMatch.id === currentMatchId && nextIndex + 1 < poolMatches.length) {
          const actualNextMatch = poolMatches[nextIndex + 1];
          this.arenaNextMatchIndex.set(arenaId, nextIndex + 2);

          console.log(
            `[RemoteScoreServer] Chargement du match suivant ${actualNextMatch.id} (pool ${currentPoolId}) sur arène ${arenaId}`
          );

          const arenaMatch: ArenaMatch = {
            id: actualNextMatch.id,
            poolId: currentPoolId,
            fencerA: actualNextMatch.fencerA!,
            fencerB: actualNextMatch.fencerB!,
            scoreA: 0,
            scoreB: 0,
            status: 'not_started',
            startTime: null,
            endTime: null,
          };

          this.assignMatchToArena(arenaId, arenaMatch);
          return;
        } else if (nextMatch.id !== currentMatchId) {
          this.arenaNextMatchIndex.set(arenaId, nextIndex + 1);

          console.log(
            `[RemoteScoreServer] Chargement du match ${nextMatch.id} (pool ${currentPoolId}) sur arène ${arenaId}`
          );

          const arenaMatch: ArenaMatch = {
            id: nextMatch.id,
            poolId: currentPoolId,
            fencerA: nextMatch.fencerA!,
            fencerB: nextMatch.fencerB!,
            scoreA: 0,
            scoreB: 0,
            status: 'not_started',
            startTime: null,
            endTime: null,
          };

          this.assignMatchToArena(arenaId, arenaMatch);
          return;
        }
      }

      console.log(
        `[RemoteScoreServer] Plus de matches dans le pool ${currentPoolId} pour l'arène ${arenaId}`
      );
    }

    // Vérifier la file d'attente DE avant de marquer l'arène comme vide
    const deQueue = this.arenaMatchQueue.get(arenaId) || [];
    if (deQueue.length > 0) {
      const nextDeMatch = deQueue[0];
      this.arenaMatchQueue.set(arenaId, deQueue.slice(1));
      console.log(`[RemoteScoreServer] Match DE suivant ${nextDeMatch.id} chargé depuis la file sur arène ${arenaId}`);
      this.assignMatchToArena(arenaId, nextDeMatch);
      return;
    }

    // Plus aucun match - marquer l'arène comme vide
    arena.currentMatch = null;
    arena.status = 'idle';
    arena.startTime = null;

    this.updateArena(arenaId, {
      currentMatch: null,
      status: 'idle',
      startTime: null,
    });
    console.log(`[RemoteScoreServer] Arène ${arenaId} marquée comme vide`);
  }

  private broadcastArenaUpdate(arenaId: string, update: ArenaUpdate): void {
    // Envoyer via Socket.IO aux clients connectés aux arènes
    this.io.emit(`arena:${arenaId}:update`, update);

    // Envoyer aussi à la fenêtre principale
    if ((global as any).mainWindow) {
      (global as any).mainWindow.webContents.send('arena:update', { arenaId, update });
    }
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

  public async startSession(
    competitionId: string,
    strips: number,
    matchesFromRenderer?: any[]
  ): Promise<RemoteSession> {
    if (this.session) {
      throw new Error('Session déjà active');
    }

    const competition = this.db.getCompetition(competitionId);
    if (!competition) {
      throw new Error('Compétition non trouvée');
    }

    // Stocker le type d'arme pour l'arrêt automatique à 15 points en Laser Sabre
    this.sessionWeapon = competition.weapon || null;
    console.log(`[RemoteScoreServer] Type d'arme de la compétition: ${this.sessionWeapon}`);

    // Auto-detect number of strips from pool count if not specified or too small
    const poolCount = this.db.getPoolCount(competitionId);
    if (strips <= 0 || strips < poolCount) {
      const actualStrips = poolCount > 0 ? poolCount : 1;
      console.log(
        `[RemoteScoreServer] Nombre de pistes ajusté: ${strips} -> ${actualStrips} (basé sur ${poolCount} poules)`
      );
      strips = actualStrips;
    }

    // Configurer le nombre d'arènes
    this.setArenaCount(strips);

    // Utiliser les matches passés depuis le renderer si disponibles, sinon chercher dans la DB
    let allMatches: any[] = [];
    if (matchesFromRenderer && matchesFromRenderer.length > 0) {
      console.log(`[RemoteScoreServer] ${matchesFromRenderer.length} matchs reçus du renderer`);
      allMatches = matchesFromRenderer.filter(
        m => m.status === 'not_started' || m.status === 'in_progress'
      );
      console.log(`[RemoteScoreServer] ${allMatches.length} matchs en attente après filtrage`);
    } else {
      // Récupérer les matchs en attente depuis la DB
      console.log('[RemoteScoreServer] Pas de matches reçus, recherche dans la DB...');
      const pendingMatches = this.db.getPendingMatches(competitionId);
      console.log(
        `[RemoteScoreServer] ${pendingMatches.length} matchs en attente trouvés pour la compétition ${competitionId}`
      );

      // Si pas de matchs trouvés via getPendingMatches (phases), essayer de récupérer via pool_fencers
      allMatches = pendingMatches;
      if (pendingMatches.length === 0) {
        console.log('[RemoteScoreServer] Tentative de récupération des matchs via pool_fencers...');
        allMatches = this.db.getAllPendingMatchesFromPools(competitionId);
        console.log(`[RemoteScoreServer] ${allMatches.length} matchs trouvés via fallback`);
      }
    }

    // Stocker les matches pour pouvoir les utiliser pour charger le match suivant
    this.sessionMatches = allMatches;
    console.log(`[RemoteScoreServer] ${this.sessionMatches.length} matches stockés en mémoire`);

    // Grouper les matches par pool
    const matchesByPool = new Map<string, any[]>();
    for (const match of allMatches) {
      const poolId = match.poolId || match.pool?.id || `pool-${match.poolNumber || match.number}`;
      if (!matchesByPool.has(poolId)) {
        matchesByPool.set(poolId, []);
      }
      matchesByPool.get(poolId)!.push(match);
    }
    console.log(
      `[RemoteScoreServer] ${matchesByPool.size} pools trouvées:`,
      Array.from(matchesByPool.keys())
    );

    // Assigner les matchs aux arènes par pool (Pool 1 -> Arena 1, Pool 2 -> Arena 2, etc.)
    console.log(`[RemoteScoreServer] Assignation des matches par pool aux ${strips} arènes`);

    let poolIndex = 0;
    for (const [poolId, poolMatches] of matchesByPool) {
      if (poolIndex >= strips) break;

      const arenaId = `arena${poolIndex + 1}`;
      const firstMatch = poolMatches[0];

      if (!firstMatch) continue;

      console.log(
        `[RemoteScoreServer] Pool ${poolId} -> Arène ${arenaId}, ${poolMatches.length} matches`
      );

      const arenaMatch: ArenaMatch = {
        id: firstMatch.id,
        poolId: poolId,
        fencerA: firstMatch.fencerA!,
        fencerB: firstMatch.fencerB!,
        scoreA: firstMatch.scoreA?.value ?? 0,
        scoreB: firstMatch.scoreB?.value ?? 0,
        status: firstMatch.status === 'in_progress' ? 'in_progress' : 'not_started',
        startTime: firstMatch.status === 'in_progress' ? new Date() : null,
        endTime: null,
      };

      this.assignMatchToArena(arenaId, arenaMatch);

      // Stocker l'index du prochain match pour cette arène (commence à 1 car le 0 est déjà assigné)
      this.arenaNextMatchIndex.set(arenaId, 1);

      console.log(
        `[RemoteScoreServer] Match ${firstMatch.id} (Pool ${poolId}) assigné à l'arène ${arenaId}`
      );

      poolIndex++;
    }

    // Distribuer les matchs d'élimination directe (sans poolId) dans les files par arène
    const deMatches = allMatches
      .filter(m => !m.poolId && (m.round !== undefined || m.isTableau))
      .sort((a: any, b: any) => (a.round || 0) - (b.round || 0));

    if (deMatches.length > 0) {
      console.log(`[RemoteScoreServer] ${deMatches.length} matchs DE à distribuer sur ${strips} arènes`);
      let rrIndex = 0;
      const queuesByArena = new Map<string, ArenaMatch[]>();
      for (let i = 1; i <= strips; i++) queuesByArena.set(`arena${i}`, []);

      for (const match of deMatches) {
        const targetArenaId = match.arena
          ? `arena${match.arena}`
          : `arena${(rrIndex % strips) + 1}`;
        if (!queuesByArena.has(targetArenaId)) {
          // arène hors plage → round-robin sur arènes disponibles
          const fallbackId = `arena${(rrIndex % strips) + 1}`;
          queuesByArena.get(fallbackId)!.push({ id: match.id, fencerA: match.fencerA, fencerB: match.fencerB, scoreA: 0, scoreB: 0, status: 'not_started', startTime: null, endTime: null });
        } else {
          queuesByArena.get(targetArenaId)!.push({ id: match.id, fencerA: match.fencerA, fencerB: match.fencerB, scoreA: 0, scoreB: 0, status: 'not_started', startTime: null, endTime: null });
        }
        rrIndex++;
      }

      for (const [arenaId, queue] of queuesByArena) {
        const arena = this.arenas.get(arenaId);
        if (!arena) continue;
        if (!arena.currentMatch && queue.length > 0) {
          // Arène libre → charger le premier match directement
          this.assignMatchToArena(arenaId, queue[0]);
          this.arenaMatchQueue.set(arenaId, queue.slice(1));
          console.log(`[RemoteScoreServer] Match DE ${queue[0].id} chargé sur arène ${arenaId}, ${queue.length - 1} en file`);
        } else {
          // Arène occupée (match de poule en cours) → tout en file
          const existing = this.arenaMatchQueue.get(arenaId) || [];
          this.arenaMatchQueue.set(arenaId, [...existing, ...queue]);
          console.log(`[RemoteScoreServer] ${queue.length} matchs DE mis en file sur arène ${arenaId}`);
        }
      }
    }

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

  public getSession(): RemoteSession | null {
    return this.session;
  }
}
