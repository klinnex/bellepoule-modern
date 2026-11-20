/**
 * BellePoule Modern - Mode Club (#1872) : contrat de prêt de matériel imprimable
 * (qui prête, à qui, quoi, quand, retour prévu, état, zones de signature).
 * Licensed under GPL-3.0
 */
import type { ClubLoan } from '../types/club';

export interface LoanContractLabels {
  title: string;
  intro: string;
  lender: string;
  /** Nom du prêteur affiché (le club) */
  lenderName: string;
  borrower: string;
  item: string;
  quantity: string;
  lentAt: string;
  dueDate: string;
  condition: string;
  notes: string;
  signLender: string;
  signBorrower: string;
  printedOn: string;
  /** Libellés d'état (clés : good, worn, damaged…) */
  condition_label: (code: string) => string;
  /** Formate une date AAAA-MM-JJ ou ISO */
  formatDate: (iso: string) => string;
  /** Valeur affichée si le tireur a été effacé ou la date absente */
  none: string;
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Échappement HTML des données saisies (noms, remarques) */
export function escapeLoanHtml(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, ch => ESC[ch] ?? ch);
}

/** Page HTML A4 du contrat de prêt, prête pour la boîte d'impression */
export function buildLoanContractHtml(
  loan: ClubLoan,
  labels: LoanContractLabels,
  today: string
): string {
  const row = (label: string, value: string) =>
    `<tr><th>${escapeLoanHtml(label)}</th><td>${escapeLoanHtml(value)}</td></tr>`;
  const due = loan.dueDate ? labels.formatDate(loan.dueDate) : labels.none;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>${escapeLoanHtml(labels.title)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p.intro { margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { border: 1px solid #999; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { width: 32%; background: #f2f2f2; }
  .sign { display: flex; gap: 32px; margin-top: 48px; }
  .sign div { flex: 1; }
  .sign-line { border-bottom: 1px solid #111; height: 72px; margin-bottom: 6px; }
  .printed { margin-top: 24px; color: #555; font-size: 11px; }
</style></head>
<body>
  <h1>${escapeLoanHtml(labels.title)}</h1>
  <p class="intro">${escapeLoanHtml(labels.intro)}</p>
  <table>
    ${row(labels.lender, labels.lenderName)}
    ${row(labels.borrower, loan.memberName ?? labels.none)}
    ${row(labels.item, loan.itemName)}
    ${row(labels.quantity, String(loan.quantity))}
    ${row(labels.lentAt, labels.formatDate(loan.lentAt))}
    ${row(labels.dueDate, due)}
    ${row(labels.condition, labels.condition_label(loan.conditionOut))}
    ${row(labels.notes, loan.notes ?? '')}
  </table>
  <div class="sign">
    <div><div class="sign-line"></div>${escapeLoanHtml(labels.signLender)}</div>
    <div><div class="sign-line"></div>${escapeLoanHtml(labels.signBorrower)}</div>
  </div>
  <p class="printed">${escapeLoanHtml(labels.printedOn)} ${escapeLoanHtml(today)}</p>
</body></html>`;
}
