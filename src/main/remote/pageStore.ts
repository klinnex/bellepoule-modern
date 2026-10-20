// Pages distantes en mémoire (#1151) : scripts inline extraits en assets versionnés, pré-compression
// brotli/gzip, ETag + revalidation 304. Plus de script inline => script-src 'self' sans nonce (#1149).
import { createHash } from 'crypto';
import { brotliCompressSync, constants as zc, gzip, gzipSync } from 'zlib';
import type { NextFunction, Request, Response } from 'express';

export type Encoding = 'br' | 'gzip';

export interface StoredBody {
  body: Buffer;
  br: Buffer;
  gzip: Buffer;
  etag: string;
  type: string;
  /** Cache-Control envoyé avec ce contenu */
  cacheControl: string;
}

export interface StoredPage extends StoredBody {
  /** true si le HTML contient encore un <script> inline (=> servir avec nonce) */
  hasInlineScript: boolean;
}

/** Choisit l'encodage selon Accept-Encoding (q-values, `*`, q=0 = refusé). br > gzip. */
export function negotiateEncoding(header: string | undefined): Encoding | null {
  if (!header) return null;
  const q: Record<string, number> = {};
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    const qp = params.map(p => p.trim()).find(p => p.startsWith('q='));
    const v = qp ? Number(qp.slice(2)) : 1;
    q[name.trim()] = Number.isFinite(v) ? v : 1;
  }
  const score = (e: string): number => (e in q ? q[e] : (q['*'] ?? 0));
  const br = score('br');
  const gz = Math.max(score('gzip'), score('x-gzip'));
  if (br > 0 && br >= gz) return 'br';
  if (gz > 0) return 'gzip';
  return null;
}

/** Vrai si If-None-Match désigne l'ETag courant (liste, `*`, préfixe faible W/) */
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === '*') return true;
  const strip = (s: string) => s.trim().replace(/^W\//, '');
  return ifNoneMatch.split(',').some(t => strip(t) === strip(etag));
}

const hash = (data: string | Buffer, len = 16): string =>
  createHash('sha256').update(data).digest('base64url').slice(0, len);

export function storeBody(content: string, type: string, cacheControl: string): StoredBody {
  const body = Buffer.from(content, 'utf8');
  return {
    body,
    br: brotliCompressSync(body, {
      params: { [zc.BROTLI_PARAM_QUALITY]: 9, [zc.BROTLI_PARAM_SIZE_HINT]: body.length },
    }),
    gzip: gzipSync(body, { level: 9 }),
    etag: `"${hash(body, 22)}"`,
    type,
    cacheControl,
  };
}

const INLINE_SCRIPT = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;

/**
 * Extrait les <script> inline exécutables vers des assets `/_a/<hash>.js` (identiques d'une page à
 * l'autre => dédupliqués, ex. client socket.io). Ordre d'exécution inchangé (scripts synchrones).
 */
export function extractInlineScripts(
  html: string,
  assets: Map<string, StoredBody>
): { html: string; hasInlineScript: boolean } {
  let hasInline = false;
  const out = html.replace(INLINE_SCRIPT, (full, attrs: string | undefined, code: string) => {
    const a = attrs ?? '';
    if (/\ssrc\s*=/i.test(' ' + a) || !code.trim()) return full;
    const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(' ' + a)?.[1]?.toLowerCase();
    if (type && type !== 'text/javascript' && type !== 'module') {
      return full; // données JSON-LD, templates… non exécutés
    }
    // defer/async sur un script inline sont sans effet : on les retire pour ne pas changer l'ordre
    const keep = a.replace(/\s(?:async|defer)(?=[\s>]|$)/gi, '');
    const url = `/_a/${hash(code)}.js`;
    if (!assets.has(url)) {
      assets.set(
        url,
        storeBody(code, 'text/javascript; charset=utf-8', 'public, max-age=31536000, immutable')
      );
    }
    return `<script${keep} src="${url}"></script>`;
  });
  if (/<script(?![^>]*\ssrc\s*=)[^>]*>[^<\s]/i.test(out)) hasInline = true;
  return { html: out, hasInlineScript: hasInline };
}

export function buildPage(html: string, assets: Map<string, StoredBody>): StoredPage {
  const { html: extracted, hasInlineScript } = extractInlineScripts(html, assets);
  return {
    ...storeBody(extracted, 'text/html; charset=utf-8', 'no-cache'),
    hasInlineScript,
  };
}

/** Envoie un contenu stocké : encodage négocié, ETag, 304 */
export function sendStored(req: Request, res: Response, item: StoredBody): void {
  res.setHeader('ETag', item.etag);
  res.setHeader('Cache-Control', item.cacheControl);
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Content-Type', item.type);
  if (etagMatches(req.headers['if-none-match'], item.etag)) {
    res.status(304).end();
    return;
  }
  const enc = negotiateEncoding(req.headers['accept-encoding'] as string | undefined);
  const payload = enc === 'br' ? item.br : enc === 'gzip' ? item.gzip : item.body;
  if (enc) res.setHeader('Content-Encoding', enc);
  res.setHeader('Content-Length', String(payload.length));
  res.end(req.method === 'HEAD' ? undefined : payload);
}

/** Compresse (gzip) les réponses res.json() de plus de `threshold` octets */
export function jsonCompression(threshold = 1024) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const original = res.json.bind(res);
    res.json = (body: unknown): Response => {
      const enc = negotiateEncoding(req.headers['accept-encoding'] as string | undefined);
      const text = JSON.stringify(body);
      if (!enc || text === undefined || Buffer.byteLength(text) < threshold) return original(body);
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      gzip(text, { level: 5 }, (err, buf) => {
        if (err) {
          res.end(text);
          return;
        }
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Length', String(buf.length));
        res.end(buf);
      });
      return res;
    };
    next();
  };
}
