/**
 * BellePoule Modern - Rapport d'exclusion (carton noir) pré-rempli pour la FFE (#1829)
 * Une page par tireur exclu : compétition, tireur, circonstances du match ; motif, témoins et
 * signatures restent à compléter à la main. Document fédéral : rédigé en français.
 * À adresser sous 48 h à competitions@ffescrime.fr (règlement FFE, annexe 14).
 * Licensed under GPL-3.0
 */

import { savePDF, BASE_CSS } from './core';
import { escHtml } from './bookToc';

export interface BlackCardReportEntry {
  fencer: { lastName: string; firstName?: string; license?: string; club?: string };
  /** « Poule 3 », « Tableau de 16 »… */
  phase?: string;
  opponent?: string;
  score?: string;
  strip?: number | string;
  referee?: string;
  /** Horodatage du carton (ou de la fin du match) */
  at?: Date;
}

export interface BlackCardReportCompetition {
  title: string;
  date?: Date;
  location?: string;
  organizer?: string;
  weapon?: string;
  category?: string;
  gender?: string;
}

const WEAPONS: Record<string, string> = {
  E: 'Épée',
  F: 'Fleuret',
  S: 'Sabre',
  L: 'Sabre laser',
  C: 'Arme personnalisée',
};
const GENDERS: Record<string, string> = { M: 'Hommes', F: 'Dames', X: 'Mixte', MIXED: 'Mixte' };

/** Document fédéral français : dates et heures au format français, quelle que soit l'interface */
const REPORT_LOCALE = 'fr-FR';

const fmtDate = (d?: Date): string =>
  d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString(REPORT_LOCALE, { day: '2-digit', month: 'long', year: 'numeric' })
    : '';
const fmtTime = (d?: Date): string =>
  d && !Number.isNaN(d.getTime())
    ? d.toLocaleTimeString(REPORT_LOCALE, { hour: '2-digit', minute: '2-digit' })
    : '';

const row = (label: string, value: string | number | undefined): string =>
  `<tr><th>${escHtml(label)}</th><td>${value === undefined || value === '' ? '<span class="blank"></span>' : escHtml(String(value))}</td></tr>`;

export function generateBlackCardReportHTML(
  competition: BlackCardReportCompetition,
  entries: BlackCardReportEntry[]
): string {
  const pages = entries
    .map(
      e => `
  <section class="page">
    <div class="doc-header">
      <div class="doc-header-left">
        <h1>Rapport d'exclusion — carton noir</h1>
        <div class="subtitle">Pré-rempli par BellePoule Modern · à compléter, signer et adresser sous 48 h à competitions@ffescrime.fr (FFE, annexe 14)</div>
      </div>
      <div class="doc-header-badge">N</div>
    </div>

    <h2>Compétition</h2>
    <table class="kv">
      ${row('Intitulé', competition.title)}
      ${row('Date', fmtDate(competition.date))}
      ${row('Lieu', competition.location)}
      ${row('Organisateur', competition.organizer)}
      ${row('Arme', WEAPONS[competition.weapon ?? ''] ?? competition.weapon)}
      ${row('Catégorie', [competition.category, GENDERS[competition.gender ?? ''] ?? competition.gender].filter(Boolean).join(' · '))}
    </table>

    <h2>Tireur sanctionné</h2>
    <table class="kv">
      ${row('Nom', e.fencer.lastName.toUpperCase())}
      ${row('Prénom', e.fencer.firstName)}
      ${row('N° de licence', e.fencer.license)}
      ${row('Club', e.fencer.club)}
    </table>

    <h2>Circonstances</h2>
    <table class="kv">
      ${row('Phase', e.phase)}
      ${row('Adversaire', e.opponent)}
      ${row('Score au moment de la sanction', e.score)}
      ${row('Piste', e.strip)}
      ${row('Heure', fmtTime(e.at))}
      ${row('Arbitre', e.referee)}
    </table>

    <h2>Motif et déroulement des faits</h2>
    <div class="lines">${'<div class="line"></div>'.repeat(7)}</div>

    <h2>Témoins</h2>
    <div class="lines">${'<div class="line"></div>'.repeat(2)}</div>

    <div class="signatures">
      <div><div class="sig-label">L'arbitre</div><div class="sig-box"></div></div>
      <div><div class="sig-label">Le directoire technique</div><div class="sig-box"></div></div>
    </div>
  </section>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${escHtml(`Rapport carton noir — ${competition.title}`)}</title>
  <style>
    ${BASE_CSS}
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    h2 { font-size: 10pt; margin: 4mm 0 1.5mm; color: var(--navy, #1a2e4a); text-transform: uppercase; letter-spacing: 0.04em; }
    table.kv { width: 100%; border-collapse: collapse; font-size: 9pt; }
    table.kv th { width: 38%; text-align: left; font-weight: 600; padding: 1.2mm 2mm; background: #f3f4f6; border: 1px solid #d1d5db; }
    table.kv td { padding: 1.2mm 2mm; border: 1px solid #d1d5db; }
    .blank { display: inline-block; min-width: 50mm; border-bottom: 1px dotted #9ca3af; height: 3.5mm; }
    .lines .line { border-bottom: 1px solid #9ca3af; height: 7mm; }
    .signatures { display: flex; gap: 10mm; margin-top: 8mm; }
    .signatures > div { flex: 1; }
    .sig-label { font-size: 9pt; font-weight: 600; margin-bottom: 1.5mm; }
    .sig-box { border: 1px solid #9ca3af; height: 22mm; border-radius: 2mm; }
  </style>
</head>
<body>
${pages}
</body>
</html>`;
}

export async function exportBlackCardReportToPDF(
  competition: BlackCardReportCompetition,
  entries: BlackCardReportEntry[]
): Promise<void> {
  const safe = competition.title.replace(/[<>:"/\\|?*]/g, '').trim() || 'competition';
  await savePDF(
    generateBlackCardReportHTML(competition, entries),
    `rapport-carton-noir-${safe}.pdf`
  );
}
