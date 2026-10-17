/**
 * BellePoule Modern - Routes du serveur distant (extraites de remoteScoreServer.ts, #1065).
 * Licensed under GPL-3.0
 */

import { buildFencerSchedule, type ScheduleMatchInput } from '../fencerSchedule';
import type { RouteContext, SessionMatch } from './context';

/** Pages HTML des arènes, écrans, tablettes et suivi public. */
export function registerPageRoutes(ctx: RouteContext): void {
  // Support both /arena1 and /arene1 formats
  ctx.app.get('/arena:arenaId', (req, res) => {
    const arenaId = req.params.arenaId;
    if (!ctx.arenas.has(`arena${arenaId}`)) {
      return res.status(404).send('Arène non trouvée');
    }
    console.log(`[RemoteScoreServer] Accès à l'arène ${arenaId}`);
    ctx.sendHtmlFromMemory('arena.html', res);
  });

  // Alias /arene pour compatibilité française
  ctx.app.get('/arene:arenaId', (req, res) => {
    const arenaId = req.params.arenaId;
    if (!ctx.arenas.has(`arena${arenaId}`)) {
      return res.status(404).send('Arène non trouvée');
    }
    console.log(`[RemoteScoreServer] Accès à l'arène (arene) ${arenaId}`);
    ctx.sendHtmlFromMemory('arena.html', res);
  });

  // Interface d'arbitrage - Dynamique (sans vérification d'existence)
  ctx.app.get('/arena:arenaId/referee', (req, res) => {
    const arenaId = req.params.arenaId;
    console.log(`[RemoteScoreServer] Accès à l'interface arbitre pour l'arène ${arenaId}`);
    if (!ctx.checkArenaAuth(arenaId, req.headers.cookie)) {
      return res.redirect(
        302,
        `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
      );
    }
    ctx.sendHtmlFromMemory('referee.html', res);
  });

  // Alias /arene pour l'interface d'arbitrage (français)
  ctx.app.get('/arene:arenaId/referee', (req, res) => {
    const arenaId = req.params.arenaId;
    console.log(`[RemoteScoreServer] Accès à l'interface arbitre pour l'arène ${arenaId} (arene)`);
    if (!ctx.checkArenaAuth(arenaId, req.headers.cookie)) {
      return res.redirect(
        302,
        `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
      );
    }
    ctx.sendHtmlFromMemory('referee.html', res);
  });

  // Alias /arbitre pour l'interface d'arbitrage
  ctx.app.get('/arbitre/:arenaId', (req, res) => {
    const arenaId = req.params.arenaId;
    console.log(
      `[RemoteScoreServer] Accès à l'interface arbitre (alias /arbitre) pour l'arène ${arenaId}`
    );
    if (!ctx.checkArenaAuth(arenaId, req.headers.cookie)) {
      return res.redirect(
        302,
        `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
      );
    }
    ctx.sendHtmlFromMemory('referee.html', res);
  });

  // Nouveau: Route /arbitre/areneX (format demandé par l'utilisateur)
  ctx.app.get('/arbitre/arene:arenaId', (req, res) => {
    const arenaId = req.params.arenaId;
    console.log(`[RemoteScoreServer] Accès à l'interface arbitre /arbitre/arene${arenaId}`);
    if (!ctx.checkArenaAuth(arenaId, req.headers.cookie)) {
      return res.redirect(
        302,
        `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
      );
    }
    ctx.sendHtmlFromMemory('referee.html', res);
  });

  // Route /areneX/arbitre (format français demandé)
  ctx.app.get('/arene:arenaId/arbitre', (req, res) => {
    const arenaId = req.params.arenaId;
    console.log(`[RemoteScoreServer] Accès à l'interface arbitre /arene${arenaId}/arbitre`);
    if (!ctx.checkArenaAuth(arenaId, req.headers.cookie)) {
      return res.redirect(
        302,
        `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
      );
    }
    ctx.sendHtmlFromMemory('referee.html', res);
  });

  // ── Format arène Sabre Laser équipe : affichage + tablette arbitre ──────────
  // Routes distinctes des arènes individuelles ci-dessus (aucun chemin partagé),
  // même modèle d'authentification par arène (checkArenaAuth).
  ctx.app.get('/equipe:arenaId', (req, res) => {
    console.log(`[RemoteScoreServer] Accès affichage équipe /equipe${req.params.arenaId}`);
    ctx.sendHtmlFromMemory('teamArena.html', res);
  });

  ctx.app.get('/equipe:arenaId/arbitre', (req, res) => {
    const arenaId = req.params.arenaId;
    console.log(`[RemoteScoreServer] Accès arbitre équipe /equipe${arenaId}/arbitre`);
    if (!ctx.checkArenaAuth(arenaId, req.headers.cookie)) {
      return res.redirect(
        302,
        `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
      );
    }
    ctx.sendHtmlFromMemory('teamReferee.html', res);
  });

  // Configurateur d'overlay (interface graphique pour générer l'URL OBS)
  ctx.app.get('/overlay-config', (req, res) => {
    ctx.sendHtmlFromMemory('overlay-config.html', res);
  });

  // Overlay de score pour streaming (OBS, vMix…) — lecture seule, aucune auth requise
  ctx.app.get('/arene:arenaId/overlay', (req, res) => {
    console.log(`[RemoteScoreServer] Accès overlay /arene${req.params.arenaId}/overlay`);
    ctx.sendHtmlFromMemory('overlay.html', res);
  });
  ctx.app.get('/arena:arenaId/overlay', (req, res) => {
    console.log(`[RemoteScoreServer] Accès overlay /arena${req.params.arenaId}/overlay`);
    ctx.sendHtmlFromMemory('overlay.html', res);
  });

  // Vue publique par arène (lecture seule, pas d'authentification requise)
  ctx.app.get('/arene:arenaId/public', (req, res) => {
    const arenaId = req.params.arenaId;
    console.log(`[RemoteScoreServer] Accès vue publique /arene${arenaId}/public`);
    ctx.sendHtmlFromMemory('public.html', res);
  });

  ctx.app.get('/arena:arenaId/public', (req, res) => {
    const arenaId = req.params.arenaId;
    console.log(`[RemoteScoreServer] Accès vue publique /arena${arenaId}/public`);
    ctx.sendHtmlFromMemory('public.html', res);
  });

  // Ordre des matchs de la poule en cours sur l'arène (lecture seule, sans auth, #911)
  ctx.app.get('/arene:arenaId/matchs', (_req, res) => {
    ctx.sendHtmlFromMemory('matchs.html', res);
  });
  ctx.app.get('/arena:arenaId/matchs', (_req, res) => {
    ctx.sendHtmlFromMemory('matchs.html', res);
  });

  // Fin estimée de la phase (kiosque, lecture seule, sans auth, #1077)
  ctx.app.get('/api/public/eta', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!ctx.session || ctx.isTrainingMode) return res.json({ eta: null });
    res.json({ eta: ctx.computePhaseEta() });
  });

  // Suivi personnel d'un tireur (QR imprimé, lecture seule, sans auth, #1078)
  ctx.app.get('/tireur/:fencerId', (_req, res) => {
    ctx.sendHtmlFromMemory('tireur.html', res);
  });
  ctx.app.get('/api/public/fencers/:fencerId/schedule', (req, res) => {
    const { fencerId } = req.params;
    if (!/^[\w-]{1,64}$/.test(fencerId))
      return res.status(400).json({ error: 'Identifiant invalide' });
    try {
      const source = ctx.sessionMatches.map(m => {
        const update = ctx.sessionMatchScores.get(m.id);
        return update ? { ...m, ...update } : m;
      });
      const arenas = [...ctx.arenas.values()].map(a => ({
        number: a.number,
        activePoolId: a.activePoolId,
        currentMatchId: a.currentMatch && a.status !== 'finished' ? a.currentMatch.id : undefined,
        currentPoolId: a.currentMatch?.poolId,
      }));
      const schedule = buildFencerSchedule(
        fencerId,
        [...source, ...finishedTableauMatches(ctx, source)],
        arenas
      );
      if (!schedule) return res.status(404).json({ error: 'Tireur introuvable' });
      res.set('Cache-Control', 'no-store');
      res.json(schedule);
    } catch (err) {
      console.error('[RemoteScoreServer] Erreur planning tireur:', err);
      res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // Page saisie OCR feuille poule (pas d'authentification par arène nécessaire)
  ctx.app.get('/poule-ocr', (req, res) => {
    if (!ctx.hasAnyValidToken(req.headers.cookie)) {
      return res.redirect(302, `/login?return=${encodeURIComponent('/poule-ocr')}`);
    }
    ctx.sendHtmlFromMemory('pool-ocr.html', res);
  });

  // Vue de saisie de poule par arène
  ctx.app.get('/arene:arenaId/poule', (req, res) => {
    const arenaId = req.params.arenaId;
    console.log(`[RemoteScoreServer] Accès à la vue poule /arene${arenaId}/poule`);
    if (!ctx.checkArenaAuth(arenaId, req.headers.cookie)) {
      return res.redirect(
        302,
        `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
      );
    }
    ctx.sendHtmlFromMemory('pool.html', res);
  });

  // Affichage kiosk grand écran public
  ctx.app.get('/kiosk', (req, res) => {
    console.log('[RemoteScoreServer] Accès au mode kiosk');
    ctx.sendHtmlFromMemory('kiosk.html', res);
  });

  // Page d'attente sans arène assignée (lobby)
  ctx.app.get('/lobby', (_req, res) => {
    ctx.sendHtmlFromMemory('lobby.html', res);
  });

  // Page de connexion pour les pages protégées par mot de passe
  ctx.app.get('/login', (_req, res) => {
    ctx.sendHtmlFromMemory('login.html', res);
  });

  // ── Auto-inscription tireur (phase CHECKIN) ────────────────────────────
  ctx.app.get('/register', (_req, res) => {
    ctx.sendHtmlFromMemory('register.html', res);
  });

  ctx.app.get('/inscription', (_req, res) => {
    ctx.sendHtmlFromMemory('register.html', res);
  });
}

/**
 * Matchs de tableau terminés, lus en base : le renderer ne transmet au serveur que
 * les matchs de tableau restant à jouer (#1078). Doublons avec la session ignorés.
 */
function finishedTableauMatches(ctx: RouteContext, source: SessionMatch[]): ScheduleMatchInput[] {
  if (!ctx.session || typeof ctx.db.getTableauMatchesForExport !== 'function') return [];
  const key = (round: unknown, a?: string, b?: string) => `${round}:${[a, b].sort().join('|')}`;
  const known = new Set(
    source.filter(m => m.isTableau).map(m => key(m.round, m.fencerA?.id, m.fencerB?.id))
  );
  try {
    return ctx.db
      .getTableauMatchesForExport(ctx.session.competitionId)
      .filter(
        m =>
          m.winner && m.fencerA && m.fencerB && !known.has(key(m.round, m.fencerA.id, m.fencerB.id))
      )
      .map(m => ({
        id: m.id,
        isTableau: true,
        round: m.round,
        fencerA: m.fencerA,
        fencerB: m.fencerB,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        status: 'finished',
      }));
  } catch {
    return [];
  }
}
