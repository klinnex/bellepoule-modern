import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { addNonces, buildPageCsp, generateNonce, sendHtmlPage } from './csp';
import { renderArenaJournalPage, renderCompetitionResultsPage } from './htmlPages';

const remoteDir = join(__dirname, '../../remote');
const pages = readdirSync(remoteDir).filter(f => f.endsWith('.html'));
const INLINE_HANDLER =
  /\son(click|dblclick|change|input|submit|load|error|key\w+|mouse\w+|focus\w*|blur|touch\w+|contextmenu|drag\w*|drop|scroll|resize|select|reset|toggle|pointer\w+)\s*=\s*["']/i;

describe('CSP pages distantes (#1149)', () => {
  it('nonce aléatoire base64 de 16 octets', () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(generateNonce()).not.toBe(a);
  });

  it('addNonces marque script et style, sans doublon', () => {
    const out = addNonces(
      '<script>a</script><script src="/x.js"></script><style>b</style><script nonce="z">c</script>',
      'N'
    );
    expect(out).toBe(
      '<script nonce="N">a</script><script nonce="N" src="/x.js"></script><style nonce="N">b</style><script nonce="z">c</script>'
    );
    expect(addNonces('<scripture>', 'N')).toBe('<scripture>');
  });

  it('politique : script-src sans unsafe-inline, objets et base verrouillés', () => {
    const csp = buildPageCsp('abc');
    const script = csp.split('; ').find(d => d.startsWith('script-src'))!;
    expect(script).toBe("script-src 'nonce-abc' 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it('sendHtmlPage pose en-tête et nonce cohérents', () => {
    const headers: Record<string, string> = {};
    let body = '';
    const res = {
      setHeader: (k: string, v: string) => (headers[k] = v),
      send: (b: string) => (body = b),
    };
    sendHtmlPage(res as never, '<script>1</script>');
    const nonce = /'nonce-([^']+)'/.exec(headers['Content-Security-Policy'])![1];
    expect(body).toBe(`<script nonce="${nonce}">1</script>`);
    expect(headers['Content-Type']).toContain('text/html');
  });

  it.each(pages)('%s : aucun handler inline ni javascript:', page => {
    const html = readFileSync(join(remoteDir, page), 'utf8');
    expect(html).not.toMatch(INLINE_HANDLER);
    expect(html).not.toMatch(/href\s*=\s*["']javascript:/i);
    // Chaque <script> reçoit un nonce une fois servie
    const served = addNonces(html, 'N');
    for (const tag of served.match(/<script\b[^>]*>/gi) ?? []) expect(tag).toContain('nonce=');
  });

  it('app.js sans handler inline', () => {
    expect(readFileSync(join(remoteDir, 'app.js'), 'utf8')).not.toMatch(INLINE_HANDLER);
  });

  it('pages générées sans handler inline', () => {
    for (const html of [renderCompetitionResultsPage('abc'), renderArenaJournalPage('1')]) {
      expect(html).not.toMatch(INLINE_HANDLER);
    }
  });

  it('chaque data-click statique cible une fonction définie dans la page', () => {
    const known = new Set(['history.back']);
    for (const page of pages) {
      const html = readFileSync(join(remoteDir, page), 'utf8');
      for (const m of html.matchAll(/data-(?:click|change|input)="([\w.]+)"/g)) {
        const name = m[1];
        if (known.has(name)) continue;
        const root = name.split('.')[0];
        const defined =
          new RegExp(`function\\s+${root}\\b`).test(html) ||
          new RegExp(`window\\.${root}\\s*=`).test(html);
        expect(defined, `${page}: ${name}`).toBe(true);
      }
    }
  });
});
