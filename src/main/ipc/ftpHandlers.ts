/**
 * BellePoule Modern - Canal IPC `ftp:publish` : envoi du fichier de résultats vers un serveur FTP/FTPS (#1331)
 * Équivalent de l'ancien `FileUploader` (libcurl) : le fichier est déposé dans le dossier indiqué par l'URL.
 * Le renderer ne fait aucun appel réseau : l'envoi part du main.
 * Licensed under GPL-3.0
 */
import { ipcMain } from 'electron';
import { Client } from 'basic-ftp';
import { Readable } from 'stream';

const TIMEOUT_MS = 20_000;
const MAX_XML_CHARS = 20 * 1024 * 1024;
const MAX_CREDENTIAL_CHARS = 200;
const FILE_NAME_RE = /^[A-Za-z0-9_.-]{1,120}\.xml$/;

export interface FtpPublishRequest {
  fileName: string;
  xml: string;
  /** URL du dossier de dépôt : ftp://hôte[:port]/dossier ou ftps://… */
  url: string;
  user: string;
  password: string;
}

export interface FtpPublishResult {
  success: boolean;
  error?: string;
}

/** Sous-ensemble du client basic-ftp utilisé ici (permet de le remplacer dans les tests) */
export interface FtpClientLike {
  access(options: {
    host: string;
    port?: number;
    user?: string;
    password?: string;
    secure: boolean;
  }): Promise<unknown>;
  cd(path: string): Promise<unknown>;
  uploadFrom(source: Readable, toRemotePath: string): Promise<unknown>;
  close(): void;
}

export interface FtpTarget {
  host: string;
  port?: number;
  secure: boolean;
  directory: string;
}

/** Valide une URL de dépôt : schéma ftp/ftps, hôte, aucun identifiant dans l'URL */
export function parseFtpUrl(raw: string): FtpTarget | string {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw)?.[1]?.toLowerCase();
  if (scheme !== 'ftp' && scheme !== 'ftps') return 'invalid_url_scheme';
  // « ftp:///dir » serait lu par l'analyseur comme hôte « dir » : on exige un hôte explicite
  if (!/^ftps?:\/\/[^/]/i.test(raw)) return 'invalid_url';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'invalid_url';
  }
  if (url.protocol !== 'ftp:' && url.protocol !== 'ftps:') return 'invalid_url_scheme';
  if (!url.hostname) return 'invalid_url';
  if (url.username || url.password) return 'credentials_in_url';

  let directory: string;
  try {
    directory = decodeURIComponent(url.pathname) || '/';
  } catch {
    return 'invalid_url';
  }
  if (directory.includes('\0')) return 'invalid_url';

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    secure: url.protocol === 'ftps:',
    directory,
  };
}

/** Valide la requête venue du renderer : URL, identifiants bornés, nom de fichier sûr, XML borné */
export function parseFtpRequest(raw: unknown): FtpPublishRequest | string {
  if (!raw || typeof raw !== 'object') return 'invalid_request';
  const { fileName, xml, url, user, password } = raw as Record<string, unknown>;
  if (typeof fileName !== 'string' || !FILE_NAME_RE.test(fileName)) return 'invalid_file_name';
  if (typeof xml !== 'string' || xml.length === 0 || xml.length > MAX_XML_CHARS)
    return 'invalid_xml';
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return 'invalid_url';
  if (typeof user !== 'string' || user.length > MAX_CREDENTIAL_CHARS) return 'invalid_user';
  if (typeof password !== 'string' || password.length > MAX_CREDENTIAL_CHARS)
    return 'invalid_password';
  return { fileName, xml, url, user, password };
}

const defaultClient = (): FtpClientLike => new Client(TIMEOUT_MS);

/**
 * Dépose le fichier dans le dossier de l'URL. Le client est toujours fermé, même en erreur.
 * Les identifiants ne sont jamais journalisés.
 */
export async function publishToFtp(
  request: FtpPublishRequest,
  createClient: () => FtpClientLike = defaultClient
): Promise<FtpPublishResult> {
  const target = parseFtpUrl(request.url);
  if (typeof target === 'string') return { success: false, error: target };

  const client = createClient();
  try {
    await client.access({
      host: target.host,
      port: target.port,
      user: request.user || undefined,
      password: request.password || undefined,
      secure: target.secure,
    });
    if (target.directory !== '/') await client.cd(target.directory);
    await client.uploadFrom(Readable.from([Buffer.from(request.xml, 'utf-8')]), request.fileName);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  } finally {
    client.close();
  }
}

ipcMain.handle('ftp:publish', async (_, raw: unknown): Promise<FtpPublishResult> => {
  const request = parseFtpRequest(raw);
  if (typeof request === 'string') return { success: false, error: request };
  return publishToFtp(request);
});
