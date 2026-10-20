import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { brotliDecompressSync, gunzipSync } from 'zlib';
import {
  buildPage,
  etagMatches,
  extractInlineScripts,
  jsonCompression,
  negotiateEncoding,
  sendStored,
  storeBody,
  type StoredBody,
} from './pageStore';

describe('negotiateEncoding (#1151)', () => {
  it('préfère br puis gzip, respecte q et *', () => {
    expect(negotiateEncoding('gzip, deflate, br')).toBe('br');
    expect(negotiateEncoding('gzip')).toBe('gzip');
    expect(negotiateEncoding('gzip;q=1.0, br;q=0.5')).toBe('gzip');
    expect(negotiateEncoding('br;q=0, gzip')).toBe('gzip');
    expect(negotiateEncoding('*')).toBe('br');
    expect(negotiateEncoding('identity')).toBeNull();
    expect(negotiateEncoding('gzip;q=0')).toBeNull();
    expect(negotiateEncoding(undefined)).toBeNull();
  });
});

describe('etagMatches', () => {
  it('liste, faible, *', () => {
    expect(etagMatches('"a"', '"a"')).toBe(true);
    expect(etagMatches('"b", "a"', '"a"')).toBe(true);
    expect(etagMatches('W/"a"', '"a"')).toBe(true);
    expect(etagMatches('*', '"a"')).toBe(true);
    expect(etagMatches('"b"', '"a"')).toBe(false);
    expect(etagMatches(undefined, '"a"')).toBe(false);
  });
});

describe('extractInlineScripts', () => {
  it('extrait, déduplique, garde src et JSON, conserve l’ordre', () => {
    const assets = new Map<string, StoredBody>();
    const html =
      '<script src="/a.js"></script><script>var x=1;</script><script type="module">import 1</script>' +
      '<script type="application/json">{"a":1}</script><script>var x=1;</script><script> </script>';
    const { html: out, hasInlineScript } = extractInlineScripts(html, assets);
    expect(assets.size).toBe(2);
    const urls = [...out.matchAll(/src="(\/_a\/[^"]+\.js)"/g)].map(m => m[1]);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(urls[2]);
    expect(out).toContain('<script src="/a.js"></script>');
    expect(out).toContain('type="module" src="/_a/');
    expect(out).toContain('<script type="application/json">{"a":1}</script>');
    expect(hasInlineScript).toBe(true); // le bloc JSON reste inline => repli nonce
  });
  it('page sans inline restant', () => {
    const assets = new Map<string, StoredBody>();
    const page = buildPage('<html><script>alert(1)</script></html>', assets);
    expect(page.hasInlineScript).toBe(false);
    expect(page.body.toString()).not.toContain('alert(1)');
    expect([...assets.values()][0].body.toString()).toBe('alert(1)');
    expect([...assets.values()][0].cacheControl).toContain('immutable');
  });
});

function fakeRes() {
  const headers: Record<string, string> = {};
  const r = {
    statusCode: 200,
    body: undefined as Buffer | string | undefined,
    headers,
    setHeader: (k: string, v: string) => (headers[k] = v),
    status(c: number) {
      r.statusCode = c;
      return r;
    },
    end(b?: Buffer | string) {
      r.body = b;
      return r;
    },
  };
  return r;
}

describe('sendStored', () => {
  const item = storeBody(
    '<p>' + 'bonjour '.repeat(500) + '</p>',
    'text/html; charset=utf-8',
    'no-cache'
  );
  const send = (h: Record<string, string>) => {
    const res = fakeRes();
    sendStored({ headers: h, method: 'GET' } as never, res as never, item);
    return res;
  };
  it('brotli, gzip ou identité selon Accept-Encoding', () => {
    const br = send({ 'accept-encoding': 'br, gzip' });
    expect(br.headers['Content-Encoding']).toBe('br');
    expect(brotliDecompressSync(br.body as Buffer).toString()).toBe(item.body.toString());
    const gz = send({ 'accept-encoding': 'gzip' });
    expect(gunzipSync(gz.body as Buffer).toString()).toBe(item.body.toString());
    const id = send({});
    expect(id.headers['Content-Encoding']).toBeUndefined();
    expect(id.body).toEqual(item.body);
    expect(id.headers.Vary).toBe('Accept-Encoding');
    expect(id.headers['Cache-Control']).toBe('no-cache');
  });
  it('304 si ETag identique', () => {
    const res = send({ 'if-none-match': item.etag, 'accept-encoding': 'br' });
    expect(res.statusCode).toBe(304);
    expect(res.body).toBeUndefined();
  });
});

describe('jsonCompression', () => {
  const run = (payload: unknown, enc: string | undefined) =>
    new Promise<{ headers: Record<string, string>; body: unknown }>(resolve => {
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (k: string, v: string) => (headers[k] = v),
        json: (b: unknown) => resolve({ headers, body: b }),
        end: (b: Buffer | string) => resolve({ headers, body: b }),
      };
      jsonCompression(1024)(
        { headers: { 'accept-encoding': enc } } as never,
        res as never,
        () => {}
      );
      (res as unknown as { json: (b: unknown) => void }).json(payload);
    });
  it('compresse au-delà du seuil seulement', async () => {
    const big = { rows: Array.from({ length: 200 }, (_, i) => ({ i, name: 'tireur ' + i })) };
    const r = await run(big, 'gzip');
    expect(r.headers['Content-Encoding']).toBe('gzip');
    expect(JSON.parse(gunzipSync(r.body as Buffer).toString())).toEqual(big);
    const small = await run({ ok: true }, 'gzip');
    expect(small.headers['Content-Encoding']).toBeUndefined();
    expect(small.body).toEqual({ ok: true });
    const none = await run(big, undefined);
    expect(none.headers['Content-Encoding']).toBeUndefined();
  });
});

describe('critère #1151 : referee.html < 60 Ko en brotli (client socket.io compris)', () => {
  it('premier chargement', () => {
    const remote = join(__dirname, '../../remote');
    const sio = readFileSync(
      join(__dirname, '../../../node_modules/socket.io/client-dist/socket.io.min.js'),
      'utf8'
    );
    let html = readFileSync(join(remote, 'referee.html'), 'utf8');
    html = html.replace(
      /<script\s+src=["']\/socket\.io\.min\.js["']><\/script>/,
      () => `<script>${sio}</script>`
    );
    const assets = new Map<string, StoredBody>();
    const page = buildPage(html, assets);
    expect(page.hasInlineScript).toBe(false);
    const total = page.br.length + [...assets.values()].reduce((n, a) => n + a.br.length, 0);
    expect(total).toBeLessThan(60 * 1024);
  });
});
