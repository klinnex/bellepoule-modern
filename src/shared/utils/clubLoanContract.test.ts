/**
 * BellePoule Modern - Tests du contrat de prêt imprimable (#1872)
 * Licensed under GPL-3.0
 */
import { describe, expect, it } from 'vitest';
import type { ClubLoan } from '../types/club';
import { buildLoanContractHtml, escapeLoanHtml, type LoanContractLabels } from './clubLoanContract';
import { normalizeExerciseWeapons } from './clubWeapon';
import { pdfDataUrl } from './clubInventory';

const labels: LoanContractLabels = {
  title: 'Contrat',
  intro: 'Intro',
  lender: 'Prêteur',
  lenderName: 'Le club',
  borrower: 'Emprunteur',
  item: 'Matériel',
  quantity: 'Quantité',
  lentAt: 'Date du prêt',
  dueDate: 'Retour prévu',
  condition: 'État',
  notes: 'Remarques',
  signLender: 'Signature club',
  signBorrower: 'Signature emprunteur',
  printedOn: 'Imprimé le',
  condition_label: c => `état-${c}`,
  formatDate: d => `FMT(${d})`,
  none: '—',
};

const loan = {
  id: 'l1',
  clubId: 'c1',
  itemId: 'i1',
  itemName: 'Plastron <b>',
  memberId: 'm1',
  memberName: 'Dupont & fils',
  quantity: 2,
  lentAt: '2026-11-01T10:00:00.000Z',
  dueDate: '2026-12-01',
  conditionOut: 'good',
  notes: '<script>x</script>',
  createdAt: '',
  updatedAt: '',
} as unknown as ClubLoan;

describe('clubLoanContract', () => {
  it('échappe les données saisies', () => {
    expect(escapeLoanHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
  });

  it('produit la fiche avec emprunteur, matériel, dates et zones de signature', () => {
    const html = buildLoanContractHtml(loan, labels, '2026-11-17');
    expect(html).toContain('Dupont &amp; fils');
    expect(html).toContain('Plastron &lt;b&gt;');
    expect(html).toContain('FMT(2026-12-01)');
    expect(html).toContain('état-good');
    expect(html).toContain('class="sign-line"');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('2026-11-17');
  });

  it('affiche « — » quand la date de retour est absente', () => {
    const html = buildLoanContractHtml({ ...loan, dueDate: undefined }, labels, '2026-11-17');
    expect(html).toContain('<td>—</td>');
  });
});

describe('armes des exercices', () => {
  it('garde les codes valides, sans doublon, dans l ordre canonique', () => {
    expect(normalizeExerciseWeapons(['L', 'f', 'X', 'L', 'A'])).toEqual(['F', 'L', 'A']);
    expect(normalizeExerciseWeapons('E')).toEqual([]);
  });
});

describe('facture PDF', () => {
  it('accepte un PDF base64 et refuse le reste', () => {
    expect(pdfDataUrl('data:application/pdf;base64,JVBERi0=')).toBe(
      'data:application/pdf;base64,JVBERi0='
    );
    expect(pdfDataUrl('data:image/png;base64,AAAA')).toBeUndefined();
    expect(pdfDataUrl('FAC-2026-001')).toBeUndefined();
  });
});
