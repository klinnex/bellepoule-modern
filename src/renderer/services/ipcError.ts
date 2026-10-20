/**
 * BellePoule Modern - Message d'erreur d'une réponse IPC du process principal (#1159) :
 * le code stable `error` (ex. `remote_not_started`) est traduit (`errors.<code>`,
 * paramètres = champs de la réponse) ; un texte libre est rendu tel quel.
 * Licensed under GPL-3.0
 */

type Translate = (key: string, params?: { [key: string]: string | number }) => string;

export function ipcErrorText(
  t: Translate,
  result: { error?: unknown; [key: string]: unknown } | null | undefined,
  fallback = ''
): string {
  const code = result?.error;
  if (typeof code !== 'string' || !code) return fallback;
  if (!/^[a-z][a-z0-9_]*$/.test(code)) return code;
  const params: { [key: string]: string | number } = {};
  for (const [k, v] of Object.entries(result ?? {})) {
    if (typeof v === 'string' || typeof v === 'number') params[k] = v;
  }
  const key = `errors.${code}`;
  const text = t(key, params);
  return text === key ? code : text;
}
