import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { parseGregRequest, publishToGreg, type GregPublishRequest } from './gregHandlers';

const fields = {
  type_competition: 'CompetitionIndividuelle',
  indivouequipe: 'indiv',
  'dp-normal-1': '03.10.2026',
  lieu: 'Salle',
  niveau: 'X',
  Division: '',
  arme: 'E',
  genre: 'H',
  categorie: 'S',
  status: 'L',
};

const request: GregPublishRequest = { fileName: 'resultats_test.xml', xml: '<x/>', fields };

function fakeFetch(statuses: number[] = [200, 200]) {
  const calls: { url: string; body: FormData }[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as FormData });
    const status = statuses[calls.length - 1] ?? 200;
    return new Response('', { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('parseGregRequest (#1328)', () => {
  it('accepte une requête bien formée', () => {
    expect(parseGregRequest(request)).toEqual(request);
  });

  it('refuse un nom de fichier qui sort du dossier attendu', () => {
    expect(parseGregRequest({ ...request, fileName: '../../etc/passwd.xml' })).toBe(
      'invalid_file_name'
    );
    expect(parseGregRequest({ ...request, fileName: 'a.txt' })).toBe('invalid_file_name');
  });

  it('refuse un champ inconnu ou manquant', () => {
    expect(parseGregRequest({ ...request, fields: { ...fields, lieu: 42 } })).toBe(
      'invalid_field:lieu'
    );
    const { lieu: _omit, ...partial } = fields;
    expect(parseGregRequest({ ...request, fields: partial })).toBe('invalid_field:lieu');
  });

  it('ignore les champs supplémentaires (jamais transmis)', () => {
    const parsed = parseGregRequest({
      ...request,
      fields: { ...fields, password: 'secret' },
    });
    expect(typeof parsed).toBe('object');
    expect(JSON.stringify(parsed)).not.toContain('secret');
  });

  it('refuse un XML vide ou une requête non objet', () => {
    expect(parseGregRequest({ ...request, xml: '' })).toBe('invalid_xml');
    expect(parseGregRequest(null)).toBe('invalid_request');
  });
});

describe('publishToGreg (#1328)', () => {
  it('envoie le fichier puis valide le formulaire, dans cet ordre', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const result = await publishToGreg(request, fetchImpl);
    expect(result).toEqual({ success: true });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(
      'http://www.escrime-info.com/gregxml/Greg/envoyer.php?fichier=resultats_test.xml'
    );
    expect(calls[1].url).toBe(
      'http://www.escrime-info.com/gregxml/Greg/envoyer.php?fichier=./temp/resultats_test.xml&valide=1'
    );
    expect(calls[0].body.get('ficXML')).toBeInstanceOf(Blob);
    expect(calls[1].body.get('arme')).toBe('E');
    expect(calls[1].body.get('submit')).toBe('send');
  });

  it("s'arrête à la première étape en erreur HTTP", async () => {
    const { fetchImpl, calls } = fakeFetch([500]);
    const result = await publishToGreg(request, fetchImpl);
    expect(result).toEqual({ success: false, error: 'HTTP 500' });
    expect(calls).toHaveLength(1);
  });

  it("remonte une erreur réseau sans lever d'exception", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;
    const result = await publishToGreg(request, fetchImpl);
    expect(result).toEqual({ success: false, error: 'getaddrinfo ENOTFOUND' });
  });
});
