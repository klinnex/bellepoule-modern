/**
 * Utilitaires partagés par DatabaseManager et les dépôts par domaine (#1242).
 */

// Champs texte d'un tireur normalisés avant stockage (#1147)
export const FENCER_TEXT_FIELDS = new Set([
  'lastName',
  'firstName',
  'nationality',
  'club',
  'region',
  'license',
  'exclusionReason',
]);

// JSON.parse tolérant : une colonne corrompue ne doit pas rendre illisible
// toute une poule ou tout un tableau (#1007).
export function safeJsonParse<T = any>(raw: unknown, fallback: T, context = ''): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'string') return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.error(`DB: JSON invalide ignoré${context ? ` (${context})` : ''}`);
    return fallback;
  }
}
