/**
 * BellePoule Modern - Routes du serveur distant (extraites de remoteScoreServer.ts, #1065).
 * Licensed under GPL-3.0
 */

import path from 'path';
import os from 'os';
import type { Server as SocketIOServer } from 'socket.io';
import { MatchStatus, type Score } from '../../../shared/types';
import type { RegistrationRouteContext } from './registrationRoutes';

/** Tireur d'une poule tel que transmis par le renderer. */
export type PoolFencer = Record<string, unknown> & { id: string };

/** État utilisé par l'authentification d'arène, la saisie et les signatures de poule. */
export interface PoolRouteContext extends RegistrationRouteContext {
  readonly io: SocketIOServer;
  readonly arenaTokens: Map<string, Map<string, number>>;
  readonly poolFencersCache: Map<string, PoolFencer[]>;
  readonly poolSignaturesCache: Map<string, Map<string, string>>;
  checkScoreRateLimit(ip: string): boolean;
  resolveReferee(refereeId?: string | null): { id: string; name: string } | null;
  broadcastDashboardUpdate(): void;
}

/** Authentification d'arène, saisie et signatures de poule, OCR. */
export function registerPoolRoutes(ctx: PoolRouteContext): void {
  // API: authentification par mot de passe pour une arène
  ctx.app.post('/api/auth/login/:arenaId', async (req, res) => {
    const rawId = req.params.arenaId;
    const fullId = rawId.startsWith('arena') ? rawId : `arena${rawId}`;
    // Limites par IP et par arène + blocage progressif
    const ip = ctx.getClientIp(req);
    const limited = ctx.checkLoginAllowed(ip, fullId);
    if (limited) return ctx.sendLoginLimited(res, limited);

    const arena = ctx.arenas.get(fullId);
    if (!arena?.password) {
      return res.json({ success: true });
    }
    const { password } = (req.body ?? {}) as { password?: unknown };
    if (!(await ctx.verifyPassword(password, arena.password))) {
      await ctx.recordLoginFailure(ip, fullId);
      return res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
    }
    ctx.recordLoginSuccess(ip);
    if (!ctx.arenaTokens.has(fullId)) ctx.arenaTokens.set(fullId, new Map());
    const token = ctx.issueToken(ctx.arenaTokens.get(fullId)!);
    // Secure seulement en HTTPS : le serveur tourne en HTTP sur le LAN du gymnase
    res.setHeader(
      'Set-Cookie',
      `bp_token_${fullId}=${token}; HttpOnly; SameSite=Strict; Max-Age=${8 * 3600}; Path=/${req.secure ? '; Secure' : ''}`
    );
    res.json({ success: true });
  });

  // API: données complètes de la poule pour une arène
  ctx.app.get('/api/arenas/:arenaId/pool-data', (req, res) => {
    const rawId = req.params.arenaId;
    // Accepte "1" ou "arena1" comme arenaId
    const arenaId = rawId.startsWith('arena') ? rawId : `arena${rawId}`;
    // Même protection que la page /poule qui consomme cette API
    if (!ctx.checkArenaAuth(arenaId, req.headers.cookie)) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    try {
      const arena = ctx.arenas.get(arenaId);
      const poolId = arena?.currentMatch?.poolId ?? arena?.activePoolId;
      if (!poolId) {
        return res.status(404).json({ error: 'Aucune poule assignée à cette arène' });
      }

      // Priorité : cache en mémoire (matchs du renderer), fallback DB
      const fencers = ctx.poolFencersCache.get(poolId) ?? ctx.db.getPoolFencers(poolId);
      const matches = (() => {
        const inMemory = ctx.sessionMatches
          .filter(m => (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) === poolId)
          .sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
        if (inMemory.length > 0) {
          return inMemory.map(m => {
            const update = ctx.sessionMatchScores.get(m.id);
            return update ? { ...m, ...update } : m;
          });
        }
        return ctx.db.getMatchesByPool(poolId);
      })();
      const isComplete =
        matches.length > 0 && matches.every((m: any) => m.status === MatchStatus.FINISHED);

      const poolName = (() => {
        if (!ctx.session) return 'Poule';
        const allPools = ctx.db.getCompetitionPools(ctx.session.competitionId);
        return allPools.find(p => p.id === poolId)?.name ?? 'Poule';
      })();

      const cachedSigs = ctx.poolSignaturesCache.get(poolId);
      const signatures: Record<string, string> = cachedSigs
        ? Object.fromEntries(cachedSigs)
        : Object.fromEntries(
            ctx.db.getPoolSignatures(poolId).map(s => [s.fencerId, s.signatureData])
          );
      if (!cachedSigs && Object.keys(signatures).length > 0) {
        ctx.poolSignaturesCache.set(poolId, new Map(Object.entries(signatures)));
      }

      res.json({ poolId, poolName, arenaId, fencers, matches, isComplete, signatures });
    } catch (err) {
      console.error('[RemoteScoreServer] Erreur pool-data:', err);
      res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // API publique : ordre des matchs de la poule de l'arène (noms + scores uniquement, #911)
  ctx.app.get('/api/arenas/:arenaId/pool-order', (req, res) => {
    const rawId = req.params.arenaId;
    const arenaId = rawId.startsWith('arena') ? rawId : `arena${rawId}`;
    try {
      const arena = ctx.arenas.get(arenaId);
      const poolId = arena?.currentMatch?.poolId ?? arena?.activePoolId;
      if (!poolId) return res.json({ poolName: null, matches: [] });

      const inMemory = ctx.sessionMatches.filter(
        (m: any) => (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) === poolId
      );
      const source: any[] =
        inMemory.length > 0
          ? inMemory.map((m: any) => {
              const update = ctx.sessionMatchScores.get(m.id);
              return update ? { ...m, ...update } : m;
            })
          : ctx.db.getMatchesByPool(poolId);
      const fencerName = (f: any) =>
        f ? [String(f.lastName ?? '').toUpperCase(), f.firstName].filter(Boolean).join(' ') : '—';
      const scoreValue = (sc: any) => (typeof sc === 'object' ? (sc?.value ?? null) : (sc ?? null));
      const matches = [...source]
        .sort((a: any, b: any) => (a.number || 0) - (b.number || 0))
        .map((m: any, i: number) => {
          const finished = m.status === MatchStatus.FINISHED || m.status === 'finished';
          const current = arena?.currentMatch?.id === m.id && !finished;
          return {
            order: m.number || i + 1,
            fencerA: fencerName(m.fencerA),
            fencerB: fencerName(m.fencerB),
            scoreA: finished ? scoreValue(m.scoreA) : null,
            scoreB: finished ? scoreValue(m.scoreB) : null,
            status: finished ? 'finished' : current ? 'current' : 'pending',
          };
        });

      const poolName = (() => {
        if (!ctx.session) return 'Poule';
        const allPools = ctx.db.getCompetitionPools(ctx.session.competitionId);
        return allPools.find(p => p.id === poolId)?.name ?? 'Poule';
      })();

      res.json({ poolName, matches });
    } catch (err) {
      console.error('[RemoteScoreServer] Erreur pool-order:', err);
      res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // API: saisir le score d'un match de poule
  ctx.app.post('/api/pools/:poolId/matches/:matchId/score', (req, res) => {
    if (!ctx.hasAnyValidToken(req.headers.cookie)) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    const clientIp = ctx.getClientIp(req);
    if (!ctx.checkScoreRateLimit(clientIp)) {
      return res.status(429).json({ error: 'Trop de soumissions, réessayez dans une minute' });
    }
    const { poolId, matchId } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(matchId) && !/^[0-9a-f-]{36}$/i.test(poolId)) {
      // Accepter aussi des IDs non-UUID (matchs en mémoire) - on valide le format souple
    }
    const {
      scoreA,
      scoreB,
      specialStatus,
      refereeId: bodyRefereeId,
    } = req.body as {
      scoreA: number;
      scoreB: number;
      specialStatus?: string;
      refereeId?: string;
    };
    // Validation des scores
    const sA = Number(scoreA);
    const sB = Number(scoreB);
    if (!Number.isInteger(sA) || !Number.isInteger(sB) || sA < 0 || sB < 0 || sA > 50 || sB > 50) {
      return res.status(400).json({ error: 'Scores invalides (entiers entre 0 et 50)' });
    }
    try {
      const winner = sA > sB ? 'A' : sB > sA ? 'B' : null;
      const scoreAObj: Score = {
        value: sA,
        isVictory: winner === 'A',
        isAbstention: specialStatus === 'abandon_A',
        isExclusion: specialStatus === 'exclusion_A',
        isForfait: specialStatus === 'forfait_A',
      };
      const scoreBObj: Score = {
        value: sB,
        isVictory: winner === 'B',
        isAbstention: specialStatus === 'abandon_B',
        isExclusion: specialStatus === 'exclusion_B',
        isForfait: specialStatus === 'forfait_B',
      };
      const previousMatch = ctx.db.getMatch(matchId);
      const resolvedRef = ctx.resolveReferee(bodyRefereeId ?? previousMatch?.referee?.id ?? null);

      // Détection conflit IP : alerte si une IP différente tente de modifier un score déjà saisi
      try {
        const existingLog = ctx.db.getScoreAuditLog(matchId);
        if (existingLog.length > 0) {
          const lastEntry = existingLog[existingLog.length - 1];
          if (lastEntry.ipAddress && lastEntry.ipAddress !== clientIp) {
            const mainWin = (global as any).mainWindow;
            if (mainWin) {
              mainWin.webContents.send('score:ip-conflict', {
                matchId,
                poolId,
                matchNumber: lastEntry.matchNumber,
                poolNumber: lastEntry.poolNumber,
                originalIp: lastEntry.ipAddress,
                originalReferee: lastEntry.refereeName ?? lastEntry.changedBy,
                attemptIp: clientIp,
                attemptReferee: resolvedRef?.name ?? 'inconnu',
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
      } catch {
        /* non bloquant */
      }

      ctx.db.updateMatch(matchId, {
        scoreA: scoreAObj,
        scoreB: scoreBObj,
        status: MatchStatus.FINISHED,
      });

      try {
        ctx.db.logScoreChange({
          matchId,
          poolId,
          previousScoreA: previousMatch?.scoreA ?? null,
          previousScoreB: previousMatch?.scoreB ?? null,
          newScoreA: scoreAObj,
          newScoreB: scoreBObj,
          changedBy: resolvedRef?.name ?? bodyRefereeId ?? 'referee',
          reason: 'pool_remote_entry',
          refereeId: resolvedRef?.id ?? bodyRefereeId,
          refereeName: resolvedRef?.name,
          ipAddress: clientIp,
        });
      } catch {
        /* non bloquant */
      }

      // Mettre à jour le score en mémoire (pour les matchs du renderer non persistés en DB)
      ctx.sessionMatchScores.set(matchId, {
        scoreA: scoreAObj,
        scoreB: scoreBObj,
        status: MatchStatus.FINISHED,
      });

      // Broadcaster la mise à jour vers toutes les vues /poule connectées
      const fencers = ctx.poolFencersCache.get(poolId) ?? ctx.db.getPoolFencers(poolId);
      const matches = (() => {
        const inMemory = ctx.sessionMatches
          .filter(m => (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) === poolId)
          .sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
        if (inMemory.length > 0) {
          return inMemory.map(m => {
            const update = ctx.sessionMatchScores.get(m.id);
            return update ? { ...m, ...update } : m;
          });
        }
        return ctx.db.getMatchesByPool(poolId);
      })();
      const isComplete = matches.every((m: any) => m.status === MatchStatus.FINISHED);
      const sigMap = ctx.poolSignaturesCache.get(poolId);
      const signatures: Record<string, string> = sigMap ? Object.fromEntries(sigMap) : {};
      for (const [aId, arena] of ctx.arenas) {
        if ((arena.currentMatch?.poolId ?? arena.activePoolId) === poolId) {
          ctx.io
            .to(`pool:${aId}`)
            .emit(`pool:${aId}:update`, { poolId, fencers, matches, isComplete, signatures });
        }
      }

      // Notifier le renderer de la mise à jour du score (pour affichage dans le tableau poule)
      const mainWindow = (global as any).mainWindow;
      if (mainWindow) {
        mainWindow.webContents.send('match:finished', {
          matchId,
          scoreA: scoreAObj.value,
          scoreB: scoreBObj.value,
          poolId,
          isTableau: false,
        });
      }

      ctx.broadcastDashboardUpdate();
      res.json({ success: true, isComplete });
    } catch (err) {
      console.error('[RemoteScoreServer] Erreur score poule:', err);
      res.status(500).json({ error: 'Erreur enregistrement score' });
    }
  });

  // API: signature numérique d'un combattant pour une poule
  ctx.app.post('/api/pools/:poolId/fencers/:fencerId/signature', (req, res) => {
    if (!ctx.hasAnyValidToken(req.headers.cookie)) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    const { poolId, fencerId } = req.params;
    const { signatureData } = req.body as { signatureData: string };

    if (!signatureData || !signatureData.startsWith('data:image/png;base64,')) {
      return res.status(400).json({ error: 'Données de signature invalides' });
    }
    if (signatureData.length > 200_000) {
      return res.status(400).json({ error: 'Signature trop volumineuse (max 150 Ko)' });
    }

    // Vérifier que le combattant a terminé tous ses matchs
    const allMatches = (() => {
      const inMemory = ctx.sessionMatches.filter(
        m => (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) === poolId
      );
      if (inMemory.length > 0) {
        return inMemory.map(m => {
          const upd = ctx.sessionMatchScores.get(m.id);
          return upd ? { ...m, ...upd } : m;
        });
      }
      return ctx.db.getMatchesByPool(poolId);
    })();

    const fencerMatches = allMatches.filter(
      (m: any) =>
        m.fencerA?.id === fencerId ||
        m.fencerAId === fencerId ||
        m.fencerB?.id === fencerId ||
        m.fencerBId === fencerId
    );

    if (fencerMatches.length === 0) {
      return res.status(404).json({ error: 'Combattant introuvable dans cette poule' });
    }
    const allDone = fencerMatches.every((m: any) => m.status === MatchStatus.FINISHED);
    if (!allDone) {
      return res.status(403).json({ error: 'Matchs non terminés pour ce combattant' });
    }

    try {
      ctx.db.savePoolSignature(poolId, fencerId, signatureData);

      if (!ctx.poolSignaturesCache.has(poolId)) {
        ctx.poolSignaturesCache.set(poolId, new Map());
      }
      ctx.poolSignaturesCache.get(poolId)!.set(fencerId, signatureData);

      // Broadcaster la mise à jour avec signatures
      const fencers = ctx.poolFencersCache.get(poolId) ?? ctx.db.getPoolFencers(poolId);
      const signatures = Object.fromEntries(ctx.poolSignaturesCache.get(poolId)!);
      const isComplete = allMatches.every((m: any) => m.status === MatchStatus.FINISHED);
      for (const [aId, arena] of ctx.arenas) {
        if ((arena.currentMatch?.poolId ?? arena.activePoolId) === poolId) {
          ctx.io.to(`pool:${aId}`).emit(`pool:${aId}:update`, {
            poolId,
            fencers,
            matches: allMatches,
            isComplete,
            signatures,
          });
        }
      }

      const mainWin = (global as any).mainWindow;
      if (mainWin) {
        const sigs = ctx.poolSignaturesCache.get(poolId)!;
        const poolFencers = ctx.poolFencersCache.get(poolId) ?? ctx.db.getPoolFencers(poolId);
        mainWin.webContents.send('pool:signature:updated', {
          poolId,
          signedFencerIds: Array.from(sigs.keys()),
          totalFencers: poolFencers.length,
        });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[RemoteScoreServer] Erreur signature:', err);
      res.status(500).json({ error: 'Erreur enregistrement signature' });
    }
  });

  // API : données d'une poule par son ID (pour OCR — sans arène)
  ctx.app.get('/api/pools/:poolId/data', (req, res) => {
    if (!ctx.hasAnyValidToken(req.headers.cookie)) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    const { poolId } = req.params;
    try {
      const fencers = ctx.poolFencersCache.get(poolId) ?? ctx.db.getPoolFencers(poolId);
      const matches = (() => {
        const inMemory = ctx.sessionMatches
          .filter((m: any) => (m.poolId || m.pool?.id) === poolId)
          .sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
        if (inMemory.length > 0) {
          return inMemory.map((m: any) => {
            const upd = ctx.sessionMatchScores.get(m.id);
            return upd ? { ...m, ...upd } : m;
          });
        }
        return ctx.db.getMatchesByPool(poolId);
      })();
      const poolName = (() => {
        if (!ctx.session) return 'Poule';
        const all = ctx.db.getCompetitionPools(ctx.session.competitionId);
        return all.find((p: any) => p.id === poolId)?.name ?? 'Poule';
      })();
      res.json({ poolId, poolName, fencers, matches });
    } catch (err) {
      console.error('[RemoteScoreServer] Erreur /api/pools/:poolId/data:', err);
      res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // API : reconnaissance OCR d'une image de feuille de poule
  ctx.app.post('/api/ocr/pool-sheet', async (req, res) => {
    if (!ctx.hasAnyValidToken(req.headers.cookie)) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    const { cells, n } = req.body as {
      cells: Array<{ row: number; col: number; data: string }>;
      n: number;
    };
    if (!Array.isArray(cells) || typeof n !== 'number' || n < 2 || n > 12) {
      return res.status(400).json({ error: 'Paramètres invalides' });
    }
    if (cells.length > 120) {
      return res.status(400).json({ error: 'Trop de cellules (max 120)' });
    }

    try {
      const Tesseract = await import('tesseract.js');
      const worker = await Tesseract.createWorker('eng', 1, {
        cachePath: path.join(os.tmpdir(), 'bp-tessdata'),
        logger: () => {},
      });
      await worker.setParameters({
        tessedit_char_whitelist: 'VD0123456789',
        tessedit_pageseg_mode: '13' as any, // PSM.RAW_LINE
      });

      const results: Array<{ row: number; col: number; text: string; confidence: number }> = [];
      for (const cell of cells) {
        if (!cell.data || !cell.data.startsWith('data:image/')) continue;
        const base64 = cell.data.replace(/^data:image\/\w+;base64,/, '');
        const buf = Buffer.from(base64, 'base64');
        const { data } = await worker.recognize(buf);
        const raw = data.text.trim().replace(/\s+/g, '').toUpperCase();
        results.push({
          row: cell.row,
          col: cell.col,
          text: raw,
          confidence: Math.round(data.confidence),
        });
      }

      await worker.terminate();
      res.json({ cells: results });
    } catch (err: any) {
      console.error('[RemoteScoreServer] Erreur OCR:', err);
      res.status(500).json({ error: `Erreur OCR: ${err?.message ?? 'inconnue'}` });
    }
  });

  // API : signature numérique d'un combattant pour un match de tableau (élimination directe)
  ctx.app.post('/api/matches/:matchId/fencers/:fencerId/signature', (req, res) => {
    if (!ctx.hasAnyValidToken(req.headers.cookie)) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    const { matchId, fencerId } = req.params;
    const { signatureData } = req.body as { signatureData: string };

    if (!signatureData || !signatureData.startsWith('data:image/png;base64,')) {
      return res.status(400).json({ error: 'Données de signature invalides' });
    }
    if (signatureData.length > 200_000) {
      return res.status(400).json({ error: 'Signature trop volumineuse (max 150 Ko)' });
    }

    // Un match de tableau est envoyé à la tablette avec son id de tableau (ex: "r16-3") ;
    // en base il est stocké sous "${competitionId}-${matchId}". On accepte les deux, ainsi
    // que les matchs connus uniquement en mémoire de session.
    const compositeId = ctx.session?.competitionId
      ? `${ctx.session.competitionId}-${matchId}`
      : null;
    const dbMatch: any =
      ctx.db.getMatch(matchId) ?? (compositeId ? ctx.db.getMatch(compositeId) : null);
    const inMemoryMatch: any = !dbMatch && ctx.sessionMatches.find((m: any) => m.id === matchId);
    if (!dbMatch && !inMemoryMatch) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }
    // Réservé aux matchs de tableau (pas de poule)
    if ((dbMatch ?? inMemoryMatch)?.poolId) {
      return res.status(400).json({ error: 'Signature de match réservée au tableau' });
    }

    try {
      ctx.db.saveDEMatchSignature(matchId, fencerId, signatureData);

      const mainWin = (global as any).mainWindow;
      if (mainWin) {
        mainWin.webContents.send('tableau:signature:updated', { matchId, fencerId });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[RemoteScoreServer] Erreur signature tableau:', err);
      res.status(500).json({ error: 'Erreur enregistrement signature' });
    }
  });
}
