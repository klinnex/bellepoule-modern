/**
 * BellePoule Modern - Envoi de webhooks depuis le processus principal (#1269)
 * Le renderer ne peut pas appeler un hôte externe (CSP connect-src) : test et notifications
 * passent par ici. Corps compatible Discord (`content`) et Slack (`text`), champs d'origine conservés.
 * Licensed under GPL-3.0
 */

import { isWebhookUrlSafe } from '../shared/services/notificationService';

export interface WebhookResult {
  success: boolean;
  /** Code HTTP renvoyé par le service (absent si la requête n'a pas abouti) */
  status?: number;
  error?: string;
}

const TIMEOUT_MS = 10000;

/** Ajoute `content` (Discord) et `text` (Slack) s'il en manque un des deux ; Discord refuse un corps sans `content`. */
export function buildWebhookBody(payload: Record<string, unknown>): Record<string, unknown> {
  const text = typeof payload.text === 'string' && payload.text ? payload.text : undefined;
  const content =
    typeof payload.content === 'string' && payload.content ? payload.content : undefined;
  const message = content ?? text ?? 'BellePoule Modern';
  return { username: 'BellePoule', ...payload, content: message, text: message };
}

export async function postWebhook(
  url: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<WebhookResult> {
  if (!isWebhookUrlSafe(url)) return { success: false, error: 'invalid_url' };
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildWebhookBody(payload)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok
      ? { success: true, status: res.status }
      : { success: false, status: res.status, error: `http_${res.status}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
