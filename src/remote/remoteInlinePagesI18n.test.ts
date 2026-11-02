import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { REMOTE_HTML_FILES } from '../main/remote/htmlLoader';

// #1344 : pages de résultats et de journal (ex-htmlPages.ts) traduites, plus de français en dur
const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');

describe.each(['results.html', 'journal.html'])('%s (#1344)', page => {
  const html = read(page);
  it('chargée en mémoire par le serveur', () => {
    expect((REMOTE_HTML_FILES as readonly string[]).includes(page)).toBe(true);
  });
  it('charge i18n.js et common.js, langue active appliquée', () => {
    expect(html).toContain('<script src="/i18n.js"></script>');
    expect(html).toContain('<script src="/common.js"></script>');
    expect(html).toContain('initRemoteI18n');
  });
  it('aucune locale fr-FR en dur', () => {
    expect(html).not.toMatch(/['"]fr-FR['"]/);
  });
});
