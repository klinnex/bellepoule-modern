/**
 * BellePoule Modern - Compte rendu PDF des commentaires de formation des arbitres (#989)
 * Une page par arbitre commenté, mise en forme proche des feuilles de poule/tableau.
 * Licensed under GPL-3.0
 */

import type { Referee, RefereeComment } from '../../types';
import { savePDF, BASE_CSS } from './core';

const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );

export function generateRefereeCommentsHTML(
  referees: Referee[],
  comments: RefereeComment[],
  competitionName?: string,
  logoBase64?: string
): string {
  const now = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const byReferee = new Map<string, RefereeComment[]>();
  for (const c of comments) {
    if (!byReferee.has(c.refereeId)) byReferee.set(c.refereeId, []);
    byReferee.get(c.refereeId)!.push(c);
  }

  const pages = referees
    .filter(r => byReferee.has(r.id))
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
    .map(r => {
      const list = byReferee.get(r.id)!;
      const rows = list
        .map(
          (c, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="when">${esc(new Date(c.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</td>
        <td class="ctx">${esc(c.matchLabel ?? '—')}</td>
        <td class="author">${esc(c.author ?? '—')}</td>
        <td class="text">${esc(c.comment)}</td>
      </tr>`
        )
        .join('');
      return `
  <section class="page">
    <div class="doc-header">
      ${logoBase64 ? `<img class="doc-header-logo" src="${logoBase64}" alt="Logo" />` : ''}
      <div class="doc-header-left">
        <h1>${esc(`${r.lastName ?? ''} ${r.firstName ?? ''}`.trim())}</h1>
        <div class="subtitle">${esc(competitionName ? `${competitionName} — ` : '')}Compte rendu de formation · ${list.length} commentaire${list.length > 1 ? 's' : ''}</div>
      </div>
      <div class="doc-header-badge" style="font-size:11pt">AR</div>
    </div>
    <div class="gold-bar"></div>
    <table>
      <colgroup><col class="num"><col class="when"><col class="ctx"><col class="author"><col></colgroup>
      <thead><tr><th>#</th><th>Date</th><th>Match</th><th>Formateur</th><th>Commentaire</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="doc-footer">
      <span>BellePoule Modern</span>
      <span>${now}</span>
    </div>
  </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Commentaires arbitres</title>
  <style>
    ${BASE_CSS}
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    /* Largeurs fixes : un commentaire long ne doit pas élargir la table (#1017) */
    table { width: 100%; border-collapse: collapse; font-size: 9pt; table-layout: fixed; }
    th {
      background: var(--navy); color: var(--white);
      font-size: 8pt; font-weight: 700; text-transform: uppercase;
      padding: 2mm; text-align: left;
    }
    td { padding: 2mm; border-bottom: 1px solid var(--gray-light); vertical-align: top; }
    tr:nth-child(even) td { background: var(--gray-xlight); }
    col.num { width: 7mm; }
    col.when { width: 26mm; }
    col.ctx { width: 40mm; }
    col.author { width: 28mm; }
    td { overflow-wrap: anywhere; word-break: break-word; }
    td.num { text-align: center; color: var(--gray-dark); }
    td.when { white-space: nowrap; }
    td.text { white-space: pre-wrap; }
    .empty { padding: 10mm; text-align: center; color: var(--gray-dark); }
  </style>
</head>
<body>
${pages || '<div class="empty">Aucun commentaire enregistré.</div>'}
</body>
</html>`;
}

export async function exportRefereeCommentsToPDF(
  referees: Referee[],
  comments: RefereeComment[],
  competitionName?: string,
  logoBase64?: string
): Promise<void> {
  const html = generateRefereeCommentsHTML(referees, comments, competitionName, logoBase64);
  const safeName = (competitionName ?? 'competition').replace(/[^\w-]+/g, '_');
  await savePDF(html, `commentaires_arbitres_${safeName}.pdf`);
}
