import { describe, it, expect, vi } from 'vitest';

// Mock d'Electron : sans lui, l'import charge node_modules/electron, dont le
// postinstall télécharge le binaire (échec CI si GitHub renvoie 503/504).
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { countPdfPages } from './pdfPageCount';

describe('countPdfPages', () => {
  it('compte les pages et ignore /Pages', () => {
    const pdf = Buffer.from(
      '<</Type /Pages /Count 2>> <</Type /Page >> <</Type/Page/Parent 1 0 R>>'
    );
    expect(countPdfPages(pdf)).toBe(2);
  });
  it('0 si aucun objet page', () => {
    expect(countPdfPages(Buffer.from('rien'))).toBe(0);
  });
});
