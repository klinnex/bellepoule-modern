/**
 * BellePoule Modern - Routes du lobby du mode entraînement (#1500).
 * GET /entrainement-lobby (page), GET /api/training/lobby (état des pistes),
 * POST /api/training/lobby/claim | release (occupation d'une piste).
 * Le kiosk lit aussi GET /api/training/lobby pour marquer « Libre » les pistes non tenues.
 * Licensed under GPL-3.0
 */
import type { RouteContext } from './context';
import { CLIENT_ID_RE, LOBBY_IDLE_MS, TrainingLobby } from '../trainingLobby';

/** Numéros des pistes (arène principale uniquement, sans sous-pistes) de la session. */
function arenaNumbers(ctx: RouteContext): number[] {
  return [...ctx.arenas.keys()]
    .map(id => /^arena(\d+)$/.exec(id))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => Number(m[1]));
}

export function registerTrainingLobbyRoutes(ctx: RouteContext, lobby = new TrainingLobby()): void {
  ctx.app.get('/entrainement-lobby', (_req, res) => {
    ctx.sendHtmlFromMemory('trainingLobby.html', res);
  });

  ctx.app.get('/api/training/lobby', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!ctx.session || !ctx.isTrainingMode) {
      return res.json({ training: false, idleMs: LOBBY_IDLE_MS, arenas: [] });
    }
    const raw = String(req.query?.client ?? '');
    const clientId = CLIENT_ID_RE.test(raw) ? raw : '';
    res.json({
      training: true,
      idleMs: LOBBY_IDLE_MS,
      theme: ctx.trainingTheme ?? 'dark',
      arenas: lobby.list(arenaNumbers(ctx), clientId),
    });
  });

  // Occupe la piste ou rafraîchit l'activité (appelé à l'ouverture puis à chaque action)
  ctx.app.post('/api/training/lobby/claim', (req, res) => {
    if (!ctx.session || !ctx.isTrainingMode) return res.status(409).json({ error: 'not_training' });
    const { arena, clientId } = (req.body ?? {}) as { arena?: unknown; clientId?: unknown };
    const n = Number(arena);
    if (!Number.isInteger(n) || !arenaNumbers(ctx).includes(n)) {
      return res.status(404).json({ error: 'arena_not_found' });
    }
    if (typeof clientId !== 'string' || !CLIENT_ID_RE.test(clientId)) {
      return res.status(400).json({ error: 'invalid_client' });
    }
    const wasMine = lobby.list([n], clientId)[0]?.mine ?? false;
    if (!lobby.claim(n, clientId)) return res.status(409).json({ error: 'arena_occupied' });
    // Kiosk : la piste passe de « Libre » à occupée
    if (!wasMine) ctx.notifyKioskData?.();
    res.json({ ok: true });
  });

  // Libère la piste (retour lobby, fermeture de page via sendBeacon)
  ctx.app.post('/api/training/lobby/release', (req, res) => {
    const { arena, clientId } = (req.body ?? {}) as { arena?: unknown; clientId?: unknown };
    if (typeof clientId !== 'string' || !CLIENT_ID_RE.test(clientId)) {
      return res.status(400).json({ error: 'invalid_client' });
    }
    const n = Number(arena);
    if (Number.isInteger(n)) lobby.release(n, clientId);
    else lobby.releaseAll(clientId);
    // Kiosk : la piste redevient « Libre »
    if (ctx.isTrainingMode) ctx.notifyKioskData?.();
    res.json({ ok: true });
  });
}
