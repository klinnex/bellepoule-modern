import { describe, it, expect } from 'vitest';
import { generateTableauHTML, TableauMatchForPDF } from './tableauPdf';

const match = (id: string, round: number, label?: string): TableauMatchForPDF => ({
  id,
  round,
  position: 1,
  label,
  fencerA: { id: `${id}a`, lastName: 'Alpha', firstName: 'A' },
  fencerB: { id: `${id}b`, lastName: 'Beta', firstName: 'B' },
  scoreA: null,
  scoreB: null,
  winner: null,
  isBye: false,
});

describe('generateTableauHTML – feuilles d’arbitrage', () => {
  it('par défaut : sous-titre et pastille de l’élimination directe', () => {
    const html = generateTableauHTML([match('m1', 8)], 4, 'Test');
    expect(html).toContain("Feuilles d'arbitrage — Élimination directe");
    expect(html).toContain('<div class="doc-header-badge">ED</div>');
    expect(html).toContain('Quarts de finale');
  });

  it('options : sous-titre, pastille et libellé de tour personnalisés (feuilles de vague)', () => {
    const html = generateTableauHTML(
      [match('m1', 0, 'Vague 2 — Poule 1')],
      4,
      'Test',
      undefined,
      undefined,
      false,
      undefined,
      {
        subtitle: "Feuilles d'arbitrage — Vague 2",
        badge: 'V2',
      }
    );
    expect(html).toContain("Feuilles d'arbitrage — Vague 2");
    expect(html).toContain('<div class="doc-header-badge">V2</div>');
    expect(html).toContain('Vague 2 — Poule 1');
    expect(html).not.toContain('Élimination directe');
  });
});
