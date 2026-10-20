// CSP des pages distantes (#1149) : nonce par réponse, pas de 'unsafe-inline' pour les scripts.
import { randomBytes } from 'crypto';
import type { Response } from 'express';

export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

/** Ajoute `nonce="…"` à chaque <script> / <style> qui n'en porte pas encore */
export function addNonces(html: string, nonce: string): string {
  return html.replace(/<(script|style)(?=[\s>])(?![^>]*\snonce=)/gi, `<$1 nonce="${nonce}"`);
}

/**
 * Politique des pages HTML. style-src garde 'unsafe-inline' : les attributs style="…" (statiques et
 * générés par JS) sont trop nombreux pour passer aux classes (#1157) ; seuls les scripts sont stricts.
 */
export function buildPageCsp(nonce?: string): string {
  return [
    "default-src 'self'",
    nonce ? `script-src 'nonce-${nonce}' 'self'` : "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self' ws: wss:",
    "worker-src 'self' blob:",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** Pose la CSP de page (avec nonce si fourni). BP_CSP_REPORT_ONLY=1 : mode rapport seul. */
export function applyPageCsp(res: Response, nonce?: string): void {
  const header =
    process.env.BP_CSP_REPORT_ONLY === '1'
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';
  res.setHeader(header, buildPageCsp(nonce));
}

/** Envoie une page HTML dont des <script> inline subsistent : nonce par réponse. */
export function sendHtmlPage(res: Response, html: string): void {
  const nonce = generateNonce();
  applyPageCsp(res, nonce);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(addNonces(html, nonce));
}
