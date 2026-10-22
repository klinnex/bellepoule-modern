import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Garde-fou XSS : les pages distantes ne doivent pas injecter de données tireur brutes dans innerHTML.
const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');

describe('échappement HTML des pages distantes', () => {
  it('dashboard.html échappe noms et clubs', () => {
    const html = read('dashboard.html');
    expect(html).toContain('<script src="/common.js"></script>');
    expect(html).not.toContain('function escHtml');
    expect(html).not.toMatch(/\$\{r\.(lastName|firstName|club)\b/);
    expect(html).not.toMatch(/\$\{match\.(fencerA|fencerB|clubA|clubB)\}/);
    expect(html).not.toMatch(/\$\{match\.club[AB] \|\|/);
  });

  it('app.js échappe les noms des tireurs', () => {
    const js = read('app.js');
    expect(js).toContain('function escapeHtml');
    expect(js).not.toMatch(/\$\{match\.fencer[AB]\?\.name/);
  });
});
