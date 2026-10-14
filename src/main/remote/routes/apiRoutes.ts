/**
 * BellePoule Modern - Routes du serveur distant (extraites de remoteScoreServer.ts, #1065).
 * Licensed under GPL-3.0
 */

import type express from 'express';
import type { Arena, ArenaMatch, OrgNote, RemoteSession } from '../../../shared/types/remote';
import type { MatchRouteContext } from './matchRoutes';

/** État et opérations utilisés par l'API configuration / session / arènes / poules. */
export interface ApiRouteContext extends MatchRouteContext {
  /** Modifiable : POST /api/session/start crée la session. */
  session: RemoteSession | null;
  readonly port: number;
  readonly currentLang: string;
  readonly socketIoClientJs: string | null;
  readonly sessionWeapon: string | null;
  readonly sessionKioskViews: Record<string, boolean>;
  readonly orgNote: OrgNote | null;
  readonly sessionLogo: string | null;
  readonly sessionWallpaper: string | null;
  readonly trainingCustomRules: {
    matchDurationSeconds: number;
    allowedZones: string[];
    disableSuddenDeath: boolean;
  } | null;
  readonly ttsConfig: { voiceName: string | null; rate: number; announce: Record<string, boolean> };
  readonly arenaCards: Map<string, { cardsA: string[]; cardsB: string[] }>;
  readonly arenaTouches: Map<string, { touchesA: string[]; touchesB: string[] }>;
  readonly arenaSuddenDeath: Map<string, boolean>;
  readonly arenaWaitingOvertime: Map<string, boolean>;
  readonly requireArenaAuth: express.RequestHandler<{ arenaId: string }>;
  readonly requireLoopback: express.RequestHandler;
  assignMatchToArena(arenaId: string, match: ArenaMatch, fromReferee?: boolean): void;
  createSession(competitionId: string, strips: number): Promise<RemoteSession>;
  getAllArenas(): Arena[];
  getArena(arenaId: string): Arena | null;
  getLocalIPAddress(): string;
  getServerUrl(): string;
  pauseArenaMatch(arenaId: string): void;
  startArenaMatch(arenaId: string): void;
  stopSession(): void;
  toPublicArena(arena: Arena): Omit<Arena, 'password'> & { hasPassword: boolean };
  updateArenaScore(arenaId: string, scoreA: number, scoreB: number): void;
}

/** Configuration, session, arènes et poules (API). */
export function registerApiRoutes(ctx: ApiRouteContext): void {
  // Fallback /bp-sio.js : sert le client socket.io déjà chargé en mémoire au
  // démarrage. Normalement inutile (le client est injecté inline dans le HTML),
  // mais couvre le cas d'un HTML mis en cache par le service worker.
  ctx.app.get('/bp-sio.js', (_req, res) => {
    if (ctx.socketIoClientJs) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.send(ctx.socketIoClientJs);
    } else {
      console.error('[RemoteScoreServer] /bp-sio.js demandé mais client non chargé');
      res.status(500).send('// socket.io client not loaded');
    }
  });

  // Redirect racine vers le lobby
  ctx.app.get('/', (_req, res) => {
    res.redirect('/lobby');
  });

  // API endpoints
  ctx.app.get('/api/config', (req, res) => {
    res.json({ lang: ctx.currentLang });
  });

  ctx.app.get('/api/server-info', (req, res) => {
    res.json({
      url: ctx.getServerUrl(),
      ip: ctx.getLocalIPAddress(),
      port: ctx.port,
    });
  });

  // Get pending matches for a competition
  ctx.app.get('/api/competitions/:competitionId/pending-matches', (req, res) => {
    try {
      const { competitionId } = req.params;

      const pendingMatches = ctx.db.getPendingMatches(competitionId);
      res.json(pendingMatches);
    } catch (error) {
      console.error('Error getting pending matches:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des matchs' });
    }
  });

  ctx.app.get('/api/debug', ctx.requireLoopback, (req, res) => {
    res.json({
      status: 'ok',
      session: ctx.session ? 'active' : 'inactive',
      serverTime: new Date().toISOString(),
      refereesCount: ctx.session?.referees.length || 0,
    });
  });

  ctx.app.get('/api/session', (req, res) => {
    console.log(
      '[RemoteScoreServer] GET /api/session - Session:',
      ctx.session ? 'active' : 'inactive'
    );
    if (!ctx.session) {
      return res.status(404).json({ error: 'Aucune session active' });
    }
    res.json({
      ...ctx.session,
      weapon: ctx.sessionWeapon,
      kioskViews: ctx.sessionKioskViews,
      orgNote: ctx.orgNote,
      blackCardEnabled: ctx.sessionBlackCardEnabled,
      ...(ctx.isTrainingMode
        ? {
            competitionName: 'Entraînement',
            isTrainingMode: true,
            trainingCustomRules: ctx.trainingCustomRules,
          }
        : {}),
    });
  });

  ctx.app.post('/api/session/start', ctx.requireLoopback, async (req, res) => {
    try {
      const { competitionId, strips } = req.body;
      const competition = ctx.db.getCompetition(competitionId);

      if (!competition) {
        return res.status(404).json({ error: 'Compétition non trouvée' });
      }

      ctx.session = await ctx.createSession(competitionId, strips);
      res.json(ctx.session);
    } catch (error) {
      console.error('Error starting session:', error);
      res.status(500).json({ error: 'Erreur lors du démarrage de la session' });
    }
  });

  ctx.app.post('/api/session/stop', ctx.requireLoopback, (req, res) => {
    ctx.stopSession();
    res.json({ success: true });
  });

  // Logo organisateur
  ctx.app.get('/api/logo', (req, res) => {
    res.json({ logo: ctx.sessionLogo });
  });

  ctx.app.get('/api/wallpaper', (req, res) => {
    res.json({ wallpaper: ctx.sessionWallpaper });
  });

  // Config TTS (minuteur vocal) pour les tablettes d'arbitrage
  ctx.app.get('/api/tts-config', (req, res) => {
    res.json(ctx.ttsConfig);
  });

  // Arena routes
  ctx.app.get('/api/arenas', (req, res) => {
    res.json(ctx.getAllArenas().map(a => ctx.toPublicArena(a)));
  });

  ctx.app.get('/api/arenas/:arenaId', (req, res) => {
    const arena = ctx.getArena(req.params.arenaId);
    if (!arena) {
      return res.status(404).json({ error: 'Arène non trouvée' });
    }
    res.json(ctx.toPublicArena(arena));
  });

  // Rapport de rotation des arbitres
  ctx.app.get('/api/referees/rotation-report', (req, res) => {
    if (!ctx.session) return res.status(404).json({ error: 'Pas de session active' });

    const competitionId = ctx.session.competitionId;
    const referees = ctx.db.getRefereesByCompetition(competitionId);
    const allMatches = ctx.db.getMatchesWithReferees(competitionId);

    const MAX_CONSECUTIVE = 3;
    const MIN_REST_MINUTES = 15;

    const report = referees.map(ref => {
      const refMatches = allMatches.filter(m => m.refereeId === ref.id && m.status === 'finished');
      const total = refMatches.length;

      // Approximer matchs consécutifs sur les derniers matchs (ordre du tableau)
      let consecutive = 0;
      for (let i = refMatches.length - 1; i >= 0; i--) {
        consecutive++;
        if (consecutive >= MAX_CONSECUTIVE) break;
        // Sans timestamp précis, on compte les derniers matchs du tableau
      }

      // Vérifier si l'arbitre est actuellement sur une piste
      const isActive = Array.from(ctx.arenas.values()).some(
        a => a.status === 'in_progress' && a.currentMatch?.referee?.id === ref.id
      );

      const fatigueScore = Math.min(100, Math.round((consecutive / MAX_CONSECUTIVE) * 100));

      return {
        refereeId: ref.id,
        refereeName: `${ref.firstName ?? ''} ${ref.lastName ?? ''}`.trim(),
        matchesTotal: total,
        consecutiveEstimate: consecutive,
        fatigueScore,
        isActive,
        needsRest: consecutive >= MAX_CONSECUTIVE || fatigueScore >= 80,
        category: (ref as any).category ?? null,
      };
    });

    // Trier par score de fatigue décroissant
    report.sort((a, b) => b.fatigueScore - a.fatigueScore);
    res.json({
      config: { maxConsecutive: MAX_CONSECUTIVE, minRestMinutes: MIN_REST_MINUTES },
      report,
    });
  });

  // Endpoint JSON structuré pour OBS Browser Source / intégrations externes
  ctx.app.get('/api/arenas/:arenaId/obs-json', (req, res) => {
    const { arenaId } = req.params;
    const arena = ctx.getArena(arenaId);
    if (!arena) return res.status(404).json({ error: 'Arène non trouvée' });

    const touches = ctx.arenaTouches.get(arenaId) || { touchesA: [], touchesB: [] };
    const cards = ctx.arenaCards.get(arenaId) || { cardsA: [], cardsB: [] };

    const countZones = (zones: string[]) => ({
      A: zones.filter(z => z === 'A').length,
      B: zones.filter(z => z === 'B').length,
      C: zones.filter(z => z === 'C').length,
    });

    res.json({
      arenaId,
      status: arena.status,
      weapon: ctx.sessionWeapon ?? null,
      match: arena.currentMatch
        ? {
            id: arena.currentMatch.id,
            fencerA: arena.currentMatch.fencerA,
            fencerB: arena.currentMatch.fencerB,
            scoreA: arena.currentMatch.scoreA,
            scoreB: arena.currentMatch.scoreB,
            referee: arena.currentMatch.referee,
          }
        : null,
      cards: { A: cards.cardsA, B: cards.cardsB },
      touches: {
        A: { raw: touches.touchesA, zones: countZones(touches.touchesA) },
        B: { raw: touches.touchesB, zones: countZones(touches.touchesB) },
      },
      suddenDeath: ctx.arenaSuddenDeath.get(arenaId) ?? false,
      waitingOvertime: ctx.arenaWaitingOvertime.get(arenaId) ?? false,
      swapped: arena.swapped ?? false,
      timestamp: new Date().toISOString(),
    });
  });

  ctx.app.post('/api/arenas/:arenaId/assign', ctx.requireArenaAuth, (req, res) => {
    const { match } = req.body;
    try {
      ctx.assignMatchToArena(req.params.arenaId, match);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Erreur inconnue' });
    }
  });

  ctx.app.post('/api/arenas/:arenaId/start', ctx.requireArenaAuth, (req, res) => {
    ctx.startArenaMatch(req.params.arenaId);
    res.json({ success: true });
  });

  ctx.app.post('/api/arenas/:arenaId/pause', ctx.requireArenaAuth, (req, res) => {
    ctx.pauseArenaMatch(req.params.arenaId);
    res.json({ success: true });
  });

  ctx.app.post('/api/arenas/:arenaId/score', ctx.requireArenaAuth, (req, res) => {
    const { scoreA, scoreB } = req.body;
    ctx.updateArenaScore(req.params.arenaId, scoreA, scoreB);
    res.json({ success: true });
  });

  ctx.app.post('/api/arenas/:arenaId/finish', ctx.requireArenaAuth, (req, res) => {
    ctx.finishArenaMatch(req.params.arenaId);
    res.json({ success: true });
  });

  // Get all pools for current competition
  ctx.app.get('/api/pools', (req, res) => {
    if (!ctx.session) {
      return res.status(404).json({ error: 'Aucune session active' });
    }
    try {
      const pools = ctx.db.getCompetitionPools(ctx.session.competitionId);
      res.json(pools);
    } catch (error) {
      console.error('Error getting pools:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des poules' });
    }
  });

  // Get matches for a specific pool
  ctx.app.get('/api/pools/:poolId/matches', (req, res) => {
    const { poolId } = req.params;
    try {
      const matches = ctx.db.getMatchesByPool(poolId);
      res.json(matches);
    } catch (error) {
      console.error('Error getting pool matches:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des matchs' });
    }
  });

  // Get pending matches for a specific pool
  ctx.app.get('/api/pools/:poolId/pending-matches', (req, res) => {
    const { poolId } = req.params;
    try {
      const matches = ctx.db.getMatchesByPool(poolId);
      const pending = matches.filter(
        m => (m.status === 'not_started' || m.status === 'in_progress') && ctx.isMatchPlayable(m)
      );
      res.json(pending);
    } catch (error) {
      console.error('Error getting pending matches:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des matchs' });
    }
  });
}
