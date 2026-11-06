import { describe, it, expect, vi } from 'vitest';
import type { Readable } from 'stream';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock('basic-ftp', () => ({ Client: class {} }));

import {
  parseFtpRequest,
  parseRemoteUrl,
  publishRemote,
  type FtpClientLike,
  type FtpPublishRequest,
} from './ftpHandlers';

const request: FtpPublishRequest = {
  fileName: 'resultats_test.xml',
  xml: '<CompetitionIndividuelle/>',
  url: 'ftps://ftp.example.org:2121/public/resultats',
  user: 'club',
  password: 'secret-pass',
};

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

function fakeClient(failOn?: 'access' | 'cd' | 'uploadFrom') {
  const calls: string[] = [];
  let uploaded = '';
  const client: FtpClientLike = {
    access: vi.fn(async () => {
      calls.push('access');
      if (failOn === 'access') throw new Error('530 Login incorrect');
    }),
    cd: vi.fn(async (path: string) => {
      calls.push(`cd:${path}`);
      if (failOn === 'cd') throw new Error('550 No such directory');
    }),
    uploadFrom: vi.fn(async (source: Readable, remote: string) => {
      calls.push(`upload:${remote}`);
      uploaded = await readAll(source);
      if (failOn === 'uploadFrom') throw new Error('553 Permission denied');
    }),
    close: vi.fn(() => {
      calls.push('close');
    }),
  };
  return { client, calls, uploaded: () => uploaded };
}

function fakeFetch(status = 201) {
  const fetchImpl = vi.fn(async () => new Response('', { status }));
  return fetchImpl as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('parseRemoteUrl (#1331)', () => {
  it('accepte ftp et ftps, avec port et dossier décodé', () => {
    expect(parseRemoteUrl('ftp://host/mes%20resultats')).toEqual({
      kind: 'ftp',
      host: 'host',
      port: undefined,
      secure: false,
      directory: '/mes resultats',
    });
    expect(parseRemoteUrl('ftps://host:2121/')).toEqual({
      kind: 'ftp',
      host: 'host',
      port: 2121,
      secure: true,
      directory: '/',
    });
  });

  it('accepte http et https pour un dépôt HTTP PUT', () => {
    const target = parseRemoteUrl('https://escrime-info.com/dossier');
    expect(target).toEqual({
      kind: 'http',
      directoryUrl: expect.any(URL),
    });
    if (typeof target === 'string' || target.kind !== 'http') throw new Error('attendu http');
    expect(target.directoryUrl.href).toBe('https://escrime-info.com/dossier/');
  });

  it("refuse les autres schémas, les URL sans hôte et les identifiants dans l'URL", () => {
    expect(parseRemoteUrl('file:///etc')).toBe('invalid_url_scheme');
    expect(parseRemoteUrl('pas une url')).toBe('invalid_url_scheme');
    expect(parseRemoteUrl('ftp:///dir')).toBe('invalid_url');
    expect(parseRemoteUrl('https:///dir')).toBe('invalid_url');
    expect(parseRemoteUrl('ftp://user:pass@host/dir')).toBe('credentials_in_url');
  });
});

describe('parseFtpRequest (#1331)', () => {
  it('accepte une requête bien formée', () => {
    expect(parseFtpRequest(request)).toEqual(request);
  });

  it('refuse un nom de fichier, un XML, une URL ou des identifiants invalides', () => {
    expect(parseFtpRequest({ ...request, fileName: '../x.xml' })).toBe('invalid_file_name');
    expect(parseFtpRequest({ ...request, xml: '' })).toBe('invalid_xml');
    expect(parseFtpRequest({ ...request, url: '' })).toBe('invalid_url');
    expect(parseFtpRequest({ ...request, user: 'x'.repeat(201) })).toBe('invalid_user');
    expect(parseFtpRequest({ ...request, password: 42 })).toBe('invalid_password');
    expect(parseFtpRequest(null)).toBe('invalid_request');
  });
});

describe('publishRemote en FTP/FTPS (#1331)', () => {
  it('se connecte, va dans le dossier, dépose le fichier puis ferme', async () => {
    const { client, calls, uploaded } = fakeClient();
    const result = await publishRemote(request, { createClient: () => client });
    expect(result).toEqual({ success: true });
    expect(calls).toEqual(['access', 'cd:/public/resultats', 'upload:resultats_test.xml', 'close']);
    expect(uploaded()).toBe('<CompetitionIndividuelle/>');
    expect(client.access).toHaveBeenCalledWith({
      host: 'ftp.example.org',
      port: 2121,
      user: 'club',
      password: 'secret-pass',
      secure: true,
    });
  });

  it("n'envoie pas d'identifiant vide et ne change pas de dossier à la racine", async () => {
    const { client, calls } = fakeClient();
    await publishRemote(
      { ...request, url: 'ftp://host/', user: '', password: '' },
      { createClient: () => client }
    );
    expect(calls).toEqual(['access', 'upload:resultats_test.xml', 'close']);
    expect(client.access).toHaveBeenCalledWith(
      expect.objectContaining({ user: undefined, password: undefined, secure: false })
    );
  });

  it("ferme toujours la connexion et remonte l'erreur, sans le mot de passe", async () => {
    for (const failOn of ['access', 'cd', 'uploadFrom'] as const) {
      const { client, calls } = fakeClient(failOn);
      const result = await publishRemote(request, { createClient: () => client });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^(530|550|553) /);
      expect(calls[calls.length - 1]).toBe('close');
      expect(JSON.stringify(result)).not.toContain('secret-pass');
    }
  });
});

describe('publishRemote en HTTP PUT (#1331)', () => {
  it('envoie le XML en PUT vers <dossier>/<fichier> avec authentification Basic', async () => {
    const fetchImpl = fakeFetch();
    const result = await publishRemote(
      { ...request, url: 'https://escrime-info.com/dossier', user: 'club', password: 'pw' },
      { fetchImpl }
    );
    expect(result).toEqual({ success: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('https://escrime-info.com/dossier/resultats_test.xml');
    expect(init.method).toBe('PUT');
    expect(init.redirect).toBe('error');
    expect(init.body).toBe('<CompetitionIndividuelle/>');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('club:pw').toString('base64')}`
    );
  });

  it("sans identifiant complet, n'envoie pas d'en-tête Authorization", async () => {
    const fetchImpl = fakeFetch();
    await publishRemote(
      { ...request, url: 'https://escrime-info.com', user: 'club', password: '' },
      { fetchImpl }
    );
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('https://escrime-info.com/resultats_test.xml');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("remonte le code HTTP en cas d'échec, sans le mot de passe", async () => {
    const result = await publishRemote(
      { ...request, url: 'https://escrime-info.com/', user: 'club', password: 'secret-pass' },
      { fetchImpl: fakeFetch(401) }
    );
    expect(result).toEqual({ success: false, error: 'HTTP 401' });
    expect(JSON.stringify(result)).not.toContain('secret-pass');
  });
});

describe('publishRemote : URL refusée (#1331)', () => {
  it('ne se connecte pas si le schéma est refusé', async () => {
    const factory = vi.fn();
    const fetchImpl = fakeFetch();
    const result = await publishRemote(
      { ...request, url: 'file:///etc/' },
      { createClient: factory, fetchImpl }
    );
    expect(result).toEqual({ success: false, error: 'invalid_url_scheme' });
    expect(factory).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
