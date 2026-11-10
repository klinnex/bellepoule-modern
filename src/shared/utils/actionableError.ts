/**
 * BellePoule Modern - Erreurs actionnables (#1535)
 * Classe une erreur (code Node, message SQLite/réseau) et produit un message
 * « ce qui a échoué — cause probable et étape suivante » pour les toasts.
 * Licensed under GPL-3.0
 */

export type ErrorHint =
  | 'file_missing'
  | 'permission'
  | 'file_busy'
  | 'disk_full'
  | 'network'
  | 'invalid_format'
  | 'db_locked'
  | 'unknown';

/** Clés i18n (errors.hint_*) pour chaque cause reconnue */
export const ERROR_HINT_KEYS: Record<ErrorHint, string> = {
  file_missing: 'errors.hint_file_missing',
  permission: 'errors.hint_permission',
  file_busy: 'errors.hint_file_busy',
  disk_full: 'errors.hint_disk_full',
  network: 'errors.hint_network',
  invalid_format: 'errors.hint_invalid_format',
  db_locked: 'errors.hint_db_locked',
  unknown: 'errors.hint_unknown',
};

const RULES: Array<[ErrorHint, RegExp]> = [
  ['file_missing', /ENOENT|no such file/i],
  ['permission', /EACCES|EPERM|permission denied|operation not permitted/i],
  ['file_busy', /EBUSY|EMFILE|resource busy|being used by another process/i],
  ['disk_full', /ENOSPC|no space left|disk full/i],
  [
    'network',
    /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|network|fetch failed/i,
  ],
  ['db_locked', /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i],
  [
    'invalid_format',
    /SyntaxError|Unexpected token|invalid (file|format|json|xml|archive)|corrupt|malformed|parse/i,
  ],
];

export function classifyError(error: unknown): ErrorHint {
  const code =
    typeof (error as { code?: unknown } | null)?.code === 'string'
      ? (error as { code: string }).code
      : '';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const probe = `${code} ${message}`;
  for (const [hint, re] of RULES) if (re.test(probe)) return hint;
  return 'unknown';
}

/** « <ce qui a échoué> — <cause probable et étape suivante> » */
export function actionableMessage(
  t: (key: string) => string,
  base: string,
  error: unknown
): string {
  return `${base} — ${t(ERROR_HINT_KEYS[classifyError(error)])}`;
}
