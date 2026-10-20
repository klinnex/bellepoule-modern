/**
 * BellePoule Modern - Routes du serveur distant (extraites de remoteScoreServer.ts, #1065).
 * Licensed under GPL-3.0
 */

import type express from 'express';
import type { Arena } from '../../../shared/types/remote';
import type { RouteContext } from './context';

type Guard = (cookieHeader: string | undefined) => {
  status: number;
  body: Record<string, unknown>;
} | null;

/** État et contrôles d'accès utilisés par l'inscription, l'appel et l'espace formateurs. */
export interface RegistrationRouteContext extends RouteContext {
  readonly registrationEnabled: boolean;
  readonly checkinEnabled: boolean;
  readonly checkinPassword: string | null;
  readonly checkinTokens: Map<string, number>;
  readonly trainerEnabled: boolean;
  readonly trainerPassword: string | null;
  readonly trainerTokens: Map<string, number>;
  getClientIp(req: express.Request): string;
  checkRegistrationRateLimit(ip: string): boolean;
  checkLoginAllowed(ip: string, target: string): { retryAfterSec: number } | null;
  sendLoginLimited(res: express.Response, limited: { retryAfterSec: number }): unknown;
  verifyPassword(password: unknown, stored: string | null | undefined): Promise<boolean>;
  issueToken(store: Map<string, number>): string;
  recordLoginFailure(ip: string, target: string): Promise<void>;
  recordLoginSuccess(ip: string): void;
  checkCheckinAuth(cookieHeader: string | undefined): boolean;
  checkTrainerAuth(cookieHeader: string | undefined): boolean;
  checkinGuard: Guard;
  trainerGuard: Guard;
  findArenaOfReferee(refereeId: string): Arena | undefined;
  arenaMatchLabel(arena: Arena): string;
}

/** Inscription, appel et espace formateur. */
export function registerRegistrationRoutes(ctx: RegistrationRouteContext): void {
  ctx.app.get('/api/register/status', (_req, res) => {
    res.json({ open: ctx.registrationEnabled });
  });

  ctx.app.post('/api/register', (req, res) => {
    if (!ctx.registrationEnabled) {
      return res.status(403).json({ registrationClosed: true, error: 'Inscription fermée' });
    }

    const ip = ctx.getClientIp(req);

    // Rate limit : 5 inscriptions par IP par minute
    if (!ctx.checkRegistrationRateLimit(ip)) {
      return res.status(429).json({ error: 'Trop de demandes. Réessayez dans 1 minute.' });
    }

    const { lastName, firstName, gender, club, license, nationality, birthDate, photo } =
      req.body as Record<string, string | null | undefined>;

    if (!lastName || typeof lastName !== 'string' || lastName.trim() === '') {
      return res.status(400).json({ error: 'Nom obligatoire' });
    }
    if (!firstName || typeof firstName !== 'string' || firstName.trim() === '') {
      return res.status(400).json({ error: 'Prénom obligatoire' });
    }
    if (!gender || !['M', 'F', 'X'].includes(gender)) {
      return res.status(400).json({ error: 'Genre invalide' });
    }

    const competitionId = ctx.session?.competitionId;
    if (!competitionId) {
      return res.status(503).json({ error: 'Aucune compétition active' });
    }

    // Valider la taille de la photo (base64, max ~500 KB → ~667 KB en base64)
    if (photo && typeof photo === 'string' && photo.length > 700_000) {
      return res.status(400).json({ error: 'Photo trop volumineuse (max 500 KB)' });
    }

    try {
      const strip = (s: string | null | undefined, max = 100) =>
        s
          ? s
              .replace(/<[^>]*>/g, '')
              .replace(/&[a-z]+;/gi, '')
              .trim()
              .substring(0, max)
          : undefined;

      const strippedLast = strip(lastName, 100);
      const strippedFirst = strip(firstName, 100);
      if (!strippedLast) return res.status(400).json({ error: 'Nom invalide après nettoyage' });
      if (!strippedFirst) return res.status(400).json({ error: 'Prénom invalide après nettoyage' });

      const fencerData = {
        lastName: strippedLast.toUpperCase(),
        firstName: strippedFirst,
        gender,
        club: strip(club) || undefined,
        license: strip(license, 50) || undefined,
        nationality: strip(nationality, 3) || 'FRA',
        birthDate: birthDate ? new Date(birthDate) : undefined,
        photo:
          photo && typeof photo === 'string' && photo.startsWith('data:image/') ? photo : undefined,
        status: 'N', // NOT_CHECKED_IN
      };

      const newFencer = ctx.db.addFencer(competitionId, fencerData as any);
      console.log(
        `[RemoteScoreServer] Inscription tireur: ${fencerData.lastName} ${fencerData.firstName} (id=${newFencer.id})`
      );
      // Liste d'appel de l'organisateur rafraîchie en direct (#986)
      const mainWin = (global as any).mainWindow;
      if (mainWin && !mainWin.isDestroyed?.()) {
        mainWin.webContents.send('remote:checkin_updated', {
          kind: 'fencer',
          id: newFencer.id,
          present: false,
        });
      }
      res.json({ success: true, fencerRef: newFencer.ref, fencerId: newFencer.id });
    } catch (err) {
      console.error('[RemoteScoreServer] Erreur inscription tireur:', err);
      res.status(500).json({ error: "Erreur lors de l'inscription" });
    }
  });

  // ── Appel distant tireurs/arbitres (#919) ──────────────────────────────
  ctx.app.get('/appel', (_req, res) => {
    ctx.sendHtmlFromMemory('checkin.html', res);
  });

  ctx.app.get('/checkin', (_req, res) => {
    ctx.sendHtmlFromMemory('checkin.html', res);
  });

  // ── Espace formateurs : commentaires d'arbitrage (#989) ────────────────
  ctx.app.get('/formateur', (_req, res) => {
    ctx.sendHtmlFromMemory('trainer.html', res);
  });

  ctx.app.get('/api/trainer/status', (req, res) => {
    res.json({
      open: ctx.trainerEnabled,
      configured: !!ctx.trainerPassword,
      authenticated: ctx.checkTrainerAuth(req.headers.cookie),
    });
  });

  ctx.app.post('/api/trainer/login', async (req, res) => {
    const ip = ctx.getClientIp(req);
    const limited = ctx.checkLoginAllowed(ip, 'trainer');
    if (limited) return ctx.sendLoginLimited(res, limited);
    if (!ctx.trainerEnabled || !ctx.trainerPassword) {
      return res.status(403).json({ success: false, notConfigured: true });
    }
    const { password } = (req.body ?? {}) as { password?: unknown };
    if (!(await ctx.verifyPassword(password, ctx.trainerPassword))) {
      await ctx.recordLoginFailure(ip, 'trainer');
      return res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
    }
    ctx.recordLoginSuccess(ip);
    const token = ctx.issueToken(ctx.trainerTokens);
    res.setHeader(
      'Set-Cookie',
      `bp_trainer_token=${token}; HttpOnly; SameSite=Strict; Max-Age=${8 * 3600}; Path=/${req.secure ? '; Secure' : ''}`
    );
    res.json({ success: true });
  });

  ctx.app.get('/api/trainer/referees', (req, res) => {
    const denied = ctx.trainerGuard(req.headers.cookie);
    if (denied) return res.status(denied.status).json(denied.body);
    const competitionId = ctx.session?.competitionId;
    if (!competitionId) return res.status(503).json({ error: 'Aucune compétition active' });
    const counts = new Map<string, number>();
    for (const c of ctx.db.getRefereeComments(competitionId)) {
      counts.set(c.refereeId, (counts.get(c.refereeId) ?? 0) + 1);
    }
    const referees = ctx.db.getRefereesByCompetition(competitionId).map(r => {
      const arena = ctx.findArenaOfReferee(r.id);
      return {
        id: r.id,
        lastName: r.lastName,
        firstName: r.firstName,
        club: r.club ?? '',
        inMatch: !!arena,
        arenaNumber: arena?.number ?? null,
        matchLabel: arena ? ctx.arenaMatchLabel(arena) : null,
        commentCount: counts.get(r.id) ?? 0,
      };
    });
    res.json({ referees });
  });

  ctx.app.get('/api/trainer/referees/:refereeId/comments', (req, res) => {
    const denied = ctx.trainerGuard(req.headers.cookie);
    if (denied) return res.status(denied.status).json(denied.body);
    const competitionId = ctx.session?.competitionId;
    if (!competitionId) return res.status(503).json({ error: 'Aucune compétition active' });
    res.json({ comments: ctx.db.getRefereeComments(competitionId, req.params.refereeId) });
  });

  ctx.app.post('/api/trainer/referees/:refereeId/comments', (req, res) => {
    const denied = ctx.trainerGuard(req.headers.cookie);
    if (denied) return res.status(denied.status).json(denied.body);
    const competitionId = ctx.session?.competitionId;
    if (!competitionId) return res.status(503).json({ error: 'Aucune compétition active' });
    const { refereeId } = req.params;
    const referee = ctx.db.getRefereesByCompetition(competitionId).find(r => r.id === refereeId);
    if (!referee) return res.status(404).json({ error: 'Arbitre inconnu' });
    const { comment, author } = (req.body ?? {}) as { comment?: unknown; author?: unknown };
    const text = typeof comment === 'string' ? comment.trim().slice(0, 4000) : '';
    if (!text) return res.status(400).json({ error: 'Commentaire vide' });
    const authorName = typeof author === 'string' ? author.trim().slice(0, 100) : null;
    const arena = ctx.findArenaOfReferee(refereeId);
    try {
      const saved = ctx.db.addRefereeComment(
        competitionId,
        refereeId,
        text,
        authorName,
        arena ? ctx.arenaMatchLabel(arena) : null
      );
      res.json({ success: true, comment: saved });
    } catch (err) {
      console.error('[RemoteScoreServer] Erreur commentaire formateur:', err);
      res.status(500).json({ error: "Erreur lors de l'enregistrement" });
    }
  });

  ctx.app.get('/api/checkin/status', (req, res) => {
    res.json({
      open: ctx.checkinEnabled,
      configured: !!ctx.checkinPassword,
      authenticated: ctx.checkCheckinAuth(req.headers.cookie),
    });
  });

  ctx.app.post('/api/checkin/login', async (req, res) => {
    const ip = ctx.getClientIp(req);
    const limited = ctx.checkLoginAllowed(ip, 'checkin');
    if (limited) return ctx.sendLoginLimited(res, limited);
    if (!ctx.checkinPassword) {
      return res.status(403).json({ success: false, notConfigured: true });
    }
    const { password } = (req.body ?? {}) as { password?: unknown };
    if (!(await ctx.verifyPassword(password, ctx.checkinPassword))) {
      await ctx.recordLoginFailure(ip, 'checkin');
      return res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
    }
    ctx.recordLoginSuccess(ip);
    const token = ctx.issueToken(ctx.checkinTokens);
    res.setHeader(
      'Set-Cookie',
      `bp_checkin_token=${token}; HttpOnly; SameSite=Strict; Max-Age=${8 * 3600}; Path=/${req.secure ? '; Secure' : ''}`
    );
    res.json({ success: true });
  });

  ctx.app.get('/api/checkin/list', (req, res) => {
    const denied = ctx.checkinGuard(req.headers.cookie);
    if (denied) return res.status(denied.status).json(denied.body);
    const competitionId = ctx.session?.competitionId;
    if (!competitionId) return res.status(503).json({ error: 'Aucune compétition active' });
    const fencers = ctx.db.getFencersByCompetition(competitionId).map(f => ({
      id: f.id,
      ref: f.ref,
      lastName: f.lastName,
      firstName: f.firstName,
      club: f.club ?? '',
      present: f.status === 'P',
      editable: f.status === 'P' || f.status === 'N',
    }));
    const referees = ctx.db.getRefereesByCompetition(competitionId).map(r => ({
      id: r.id,
      ref: r.ref,
      lastName: r.lastName,
      firstName: r.firstName,
      club: r.club ?? '',
      present: r.status !== 'unavailable',
      editable: r.status !== 'assigned',
    }));
    res.json({ fencers, referees });
  });

  ctx.app.post('/api/checkin/:kind/:id', (req, res) => {
    const denied = ctx.checkinGuard(req.headers.cookie);
    if (denied) return res.status(denied.status).json(denied.body);
    const { kind, id } = req.params;
    const { present } = (req.body ?? {}) as { present?: unknown };
    if (kind !== 'fencers' && kind !== 'referees') {
      return res.status(404).json({ error: 'Type inconnu' });
    }
    if (typeof present !== 'boolean') {
      return res.status(400).json({ error: 'Champ "present" invalide' });
    }
    const competitionId = ctx.session?.competitionId;
    if (!competitionId) return res.status(503).json({ error: 'Aucune compétition active' });

    try {
      if (kind === 'fencers') {
        const fencer = ctx.db.getFencersByCompetition(competitionId).find(f => f.id === id);
        if (!fencer) return res.status(404).json({ error: 'Tireur introuvable' });
        // Ne jamais écraser un statut sportif (éliminé, exclu, forfait…)
        if (fencer.status !== 'P' && fencer.status !== 'N') {
          return res.status(409).json({ error: 'Statut du tireur non modifiable' });
        }
        ctx.db.updateFencer(id, { status: (present ? 'P' : 'N') as any });
      } else {
        const referee = ctx.db.getRefereesByCompetition(competitionId).find(r => r.id === id);
        if (!referee) return res.status(404).json({ error: 'Arbitre introuvable' });
        if (referee.status === 'assigned') {
          return res.status(409).json({ error: 'Arbitre déjà assigné' });
        }
        ctx.db.updateReferee(id, { status: present ? 'available' : 'unavailable' });
      }
    } catch (err) {
      console.error('[RemoteScoreServer] Erreur appel distant:', err);
      return res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }

    const mainWin = (global as any).mainWindow;
    if (mainWin && !mainWin.isDestroyed?.()) {
      mainWin.webContents.send('remote:checkin_updated', {
        kind: kind === 'fencers' ? 'fencer' : 'referee',
        id,
        present,
      });
    }
    res.json({ success: true });
  });
}
