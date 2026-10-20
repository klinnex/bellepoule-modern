/**
 * BellePoule Modern - Annonces carton/sortie relayées aux écrans (extrait de remoteScoreServer.ts).
 * Licensed under GPL-3.0
 */

/** Annonce carton/sortie relayée aux écrans : champs connus seulement, textes neutralisés (#995). */
export function sanitizeAnnouncement(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const CARDS = ['white', 'yellow', 'red', 'black'];
  const text = (v: unknown, max = 80): string =>
    typeof v === 'string'
      ? v
          // eslint-disable-next-line no-control-regex
          .replace(/[<>\u0000-\u001f]/g, '')
          .slice(0, max)
          .trim()
      : '';
  const card = (v: unknown): string | null =>
    typeof v === 'string' && CARDS.includes(v) ? v : null;
  return {
    fencer: a.fencer === 'B' ? 'B' : 'A',
    fencerName: text(a.fencerName),
    cardType: card(a.cardType) ?? 'yellow',
    isRevalorisation: a.isRevalorisation === true,
    fromCard: card(a.fromCard),
    toCard: card(a.toCard),
    reason: text(a.reason, 120) || null,
    points: typeof a.points === 'number' && Number.isFinite(a.points) ? Math.trunc(a.points) : 0,
  };
}
