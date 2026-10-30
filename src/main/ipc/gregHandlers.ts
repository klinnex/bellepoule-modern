/**
 * BellePoule Modern - Canal IPC `greg:publish` : envoi des résultats vers GREG (escrime-info.com) (#1328)
 * Deux étapes comme l'ancien `GregUploader` : envoi du fichier, puis validation du formulaire.
 * Le renderer ne peut pas appeler un hôte externe (CSP) : l'envoi part du main.
 * Licensed under GPL-3.0
 */
import { ipcMain } from 'electron';
import {
  GREG_FIELD_NAMES,
  GREG_UPLOAD_URL,
  GregFormFields,
} from '../../shared/utils/gregPublication';

const TIMEOUT_MS = 20_000;
const MAX_XML_CHARS = 20 * 1024 * 1024;
const FILE_NAME_RE = /^[A-Za-z0-9_.-]{1,120}\.xml$/;

export interface GregPublishRequest {
  fileName: string;
  xml: string;
  fields: GregFormFields;
}

export interface GregPublishResult {
  success: boolean;
  error?: string;
}

/** Valide la requête venue du renderer : seuls les champs connus, un nom de fichier sûr, un XML borné */
export function parseGregRequest(raw: unknown): GregPublishRequest | string {
  if (!raw || typeof raw !== 'object') return 'invalid_request';
  const { fileName, xml, fields } = raw as Record<string, unknown>;
  if (typeof fileName !== 'string' || !FILE_NAME_RE.test(fileName)) return 'invalid_file_name';
  if (typeof xml !== 'string' || xml.length === 0 || xml.length > MAX_XML_CHARS)
    return 'invalid_xml';
  if (!fields || typeof fields !== 'object') return 'invalid_fields';

  const clean: Partial<Record<keyof GregFormFields, string>> = {};
  for (const key of GREG_FIELD_NAMES) {
    const value = (fields as Record<string, unknown>)[key];
    if (typeof value !== 'string' || value.length > 500) return `invalid_field:${key}`;
    clean[key] = value;
  }
  return { fileName, xml, fields: clean as GregFormFields };
}

async function postForm(
  fetchImpl: typeof fetch,
  url: string,
  fields: [string, string | Blob, string?][]
): Promise<void> {
  const form = new FormData();
  for (const [name, value, filename] of fields) {
    if (typeof value === 'string') form.append(name, value);
    else form.append(name, value, filename);
  }
  const response = await fetchImpl(url, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/**
 * Envoi en deux étapes. Le serveur ne renvoie pas de statut exploitable : seul le code HTTP
 * est vérifié, le résultat définitif reste à contrôler sur escrime-info.com.
 */
export async function publishToGreg(
  request: GregPublishRequest,
  fetchImpl: typeof fetch = fetch
): Promise<GregPublishResult> {
  const name = encodeURIComponent(request.fileName);
  try {
    await postForm(fetchImpl, `${GREG_UPLOAD_URL}?fichier=${name}`, [
      ['ficXML', new Blob([request.xml], { type: 'application/xml' }), request.fileName],
      ['submit', 'send'],
    ]);
    await postForm(fetchImpl, `${GREG_UPLOAD_URL}?fichier=./temp/${name}&valide=1`, [
      ...Object.entries(request.fields).map(([k, v]): [string, string] => [k, v]),
      ['submit', 'send'],
    ]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
}

// Enregistrement à l'import : `main.ts` n'a qu'à importer ce module (quota de lignes du main)
ipcMain.handle('greg:publish', async (_, raw: unknown): Promise<GregPublishResult> => {
  const request = parseGregRequest(raw);
  if (typeof request === 'string') return { success: false, error: request };
  return publishToGreg(request);
});
