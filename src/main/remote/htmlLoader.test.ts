import { describe, it, expect } from 'vitest';
import { REMOTE_HTML_FILES, inlineSocketIoClient, loadRemoteHtmlFiles } from './htmlLoader';

describe('htmlLoader', () => {
  it('inlineSocketIoClient remplace la balise sans interpréter les motifs `$&`', () => {
    const js = 'var a=this.$&&1;';
    const out = inlineSocketIoClient('<head><script src="/bp-sio.js"></script></head>', js);
    expect(out).toBe(`<head><script>${js}</script></head>`);
  });

  it('inlineSocketIoClient laisse le HTML intact sans balise connue', () => {
    const html = '<script src="/app.js"></script>';
    expect(inlineSocketIoClient(html, 'x')).toBe(html);
  });

  it('loadRemoteHtmlFiles ne charge que des pages connues et injecte le client', () => {
    const { htmlFiles, remoteBasePath } = loadRemoteHtmlFiles('/*sio*/');
    expect(remoteBasePath === null).toBe(htmlFiles.size === 0);
    for (const [name, html] of htmlFiles) {
      expect(REMOTE_HTML_FILES as readonly string[]).toContain(name);
      expect(html).not.toMatch(/<script\s+src=["']\/bp-sio\.js["']>/);
    }
  });
});
