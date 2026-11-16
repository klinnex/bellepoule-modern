/**
 * BellePoule Modern - Mode Club (#1872) : identification des tireurs par leur carte de club
 * depuis la tablette arbitre (serveur d'entraînement relié à une séance ouverte).
 * GET /api/club/identify (scan proposé ?), POST /api/club/identify (cartes A et B lues).
 * Licensed under GPL-3.0
 */
import type { ApiRouteContext } from './apiRoutes';
import { identifyClubBout, linkedOpenSession } from '../clubArena';
import { normalizeCardCode, parseClubQr } from '../../../shared/utils/clubQr';

/** Code lu (QR `BPC1:M:<code>` ou code en clair), null = identification passée */
function readCode(v: unknown): string | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || v.length > 40) return 'invalid';
  const qr = parseClubQr(v);
  if (qr) return qr.kind === 'member' ? qr.code : 'invalid';
  return normalizeCardCode(v) ?? 'invalid';
}

export function registerClubRoutes(ctx: ApiRouteContext): void {
  ctx.app.get('/api/club/identify', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const session = ctx.isTrainingMode && ctx.session ? linkedOpenSession(ctx.db) : null;
    const club = session ? ctx.db.club.getClub(session.clubId) : null;
    res.json({ active: !!session, club: club?.name ?? '' });
  });

  ctx.app.post('/api/club/identify', (req, res) => {
    if (!ctx.isTrainingMode || !ctx.session) {
      return res.status(409).json({ ok: false, error: 'no_session' });
    }
    // Codes de carte devinables par essais : même limite que la saisie des scores
    if (!ctx.checkScoreRateLimit(ctx.getClientIp(req))) {
      return res.status(429).json({ ok: false, error: 'rate_limited' });
    }
    const body = (req.body ?? {}) as { arena?: unknown; codeA?: unknown; codeB?: unknown };
    const codeA = readCode(body.codeA);
    const codeB = readCode(body.codeB);
    if (codeA === 'invalid' || codeB === 'invalid') {
      return res
        .status(400)
        .json({ ok: false, error: 'unknown_card', side: codeA === 'invalid' ? 'A' : 'B' });
    }
    try {
      const result = identifyClubBout(
        {
          club: ctx.db.club,
          getArena: id => ctx.getArena(id),
          assignMatchToArena: (id, match) => ctx.assignMatchToArena(id, match),
        },
        Number(body.arena),
        codeA,
        codeB
      );
      res.status(result.ok ? 200 : 409).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'error' });
    }
  });
}
