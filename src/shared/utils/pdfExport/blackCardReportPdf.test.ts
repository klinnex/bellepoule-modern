import { describe, it, expect } from 'vitest';
import { generateBlackCardReportHTML } from './blackCardReportPdf';

describe('generateBlackCardReportHTML (#1829, annexe 14 FFE)', () => {
  it('une page par tireur exclu, champs pré-remplis et échappés', () => {
    const html = generateBlackCardReportHTML(
      { title: 'Open <Gratien>', date: new Date('2026-11-15T09:00:00Z'), weapon: 'E', gender: 'M' },
      [
        {
          fencer: { lastName: 'Dupont', firstName: 'Léa', license: '123', club: 'CE Gratien' },
          phase: 'Poule 2',
          opponent: 'MARTIN Paul',
          score: '3 – 4',
          strip: 5,
          referee: 'DURAND Léo',
        },
        { fencer: { lastName: 'Bernard' } },
      ]
    );
    expect(html.match(/<section class="page">/g)).toHaveLength(2);
    expect(html).toContain('Open &lt;Gratien&gt;');
    expect(html).toContain('DUPONT');
    expect(html).toContain('Épée');
    expect(html).toContain('Hommes');
    expect(html).toContain('3 – 4');
    expect(html).toContain('competitions@ffescrime.fr');
    // Champs absents : ligne à compléter
    expect(html).toContain('<span class="blank"></span>');
  });
});
