import { describe, it, expect } from 'vitest';
import { buildQrSheetsHTML, QR_PER_PAGE_LAYOUTS } from '../ArenaQrCodesModal';

const card = (n: number) => ({
  title: `Piste ${n}`,
  subtitle: 'Arbitre',
  url: `https://x/arene${n}/arbitre`,
  dataUrl: 'data:image/png;base64,AA',
});

describe('buildQrSheetsHTML (#1039)', () => {
  it('répartit les QR Codes sur le nombre de feuilles attendu', () => {
    const html = buildQrSheetsHTML([1, 2, 3, 4, 5].map(card), 4);
    expect(html.match(/class="page"/g)).toHaveLength(2);
    expect(html.match(/class="cell"/g)).toHaveLength(5);
  });

  it('utilise la grille correspondant au nombre par feuille', () => {
    const [cols, rows] = QR_PER_PAGE_LAYOUTS[6];
    const html = buildQrSheetsHTML([card(1)], 6);
    expect(html).toContain(`repeat(${cols},`);
    expect(html).toContain(`repeat(${rows},`);
  });

  it('échappe le HTML des libellés', () => {
    const html = buildQrSheetsHTML([{ ...card(1), title: '<b>x</b>' }], 1);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
