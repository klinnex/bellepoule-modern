/**
 * BellePoule Modern - PDF Export Service
 * Export PDF complet d'une compétition (appel, poules, classements, tableaux, résultats)
 * Licensed under GPL-3.0
 */

import { Fencer, Pool, PoolRanking } from '../../types';
import type { PdfTemplate } from '../../types/pdfTemplate.types';
import { MAX_MATCHES_PER_PAGE_TABLEAU } from '../pdfConstants';
import { savePDF } from './core';
import { generatePoolHTML } from './poolPdf';
import { TableauMatchForPDF, generateTableauHTML, getTableauRoundName } from './tableauPdf';
import { generateRankingHTML } from './rankingPdf';
import { FinalResultForPDF, generateResultsHTML } from './resultsPdf';
import { generateAppelHTML } from './appelPdf';

// ─── Export complet compétition ───────────────────────────────────────────────

function extractBodyContent(html: string): string {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return m ? m[1].trim() : '';
}

function extractStyleContent(html: string): string {
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const parts: string[] = [];
  let m;
  while ((m = re.exec(html)) !== null) parts.push(m[1]);
  return parts.join('\n');
}

export interface FullCompetitionExportData {
  fencers: Fencer[];
  /** Colonnes visibles de la feuille d'appel (respecte la config UI) */
  appelVisibleColumns?: string[];
  pools: Pool[];
  overallRanking: PoolRanking[];
  tableauMatches: TableauMatchForPDF[];
  consolationBrackets: { id: string; name: string; matches: TableauMatchForPDF[] }[];
  finalResults: FinalResultForPDF[];
  competitionTitle: string;
  isLaserSabre?: boolean;
  template?: PdfTemplate;
  /** Signatures des poules : poolId → (fencerId → data URL PNG) */
  poolSignatures?: Record<string, Record<string, string>>;
  /** Signatures des matchs de tableau : matchId → { A, B } data URL PNG */
  tableauSignatures?: Record<string, { A?: string; B?: string }>;
}

export async function exportFullCompetitionPDF(data: FullCompetitionExportData): Promise<void> {
  const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
  const {
    fencers,
    appelVisibleColumns,
    pools,
    overallRanking,
    tableauMatches,
    consolationBrackets,
    finalResults,
    competitionTitle,
    isLaserSabre = false,
    template,
    poolSignatures,
    tableauSignatures,
  } = data;

  const sections: string[] = [];

  if (fencers.length > 0) {
    const appelCols = appelVisibleColumns ?? [
      'ref',
      'lastName',
      'firstName',
      'birthDate',
      'club',
      'ranking',
      'status',
    ];
    // Si les tireurs viennent de l'appel, ils sont déjà triés ; sinon tri par défaut
    const appelFencerList = appelVisibleColumns
      ? fencers
      : [...fencers].sort(
          (a, b) =>
            (a.ranking ?? Infinity) - (b.ranking ?? Infinity) ||
            a.lastName.localeCompare(b.lastName)
        );
    sections.push(
      generateAppelHTML(
        appelFencerList,
        appelCols,
        `Feuille d'appel — ${competitionTitle}`,
        competitionTitle,
        logo,
        undefined
      )
    );
  }

  for (const pool of pools) {
    sections.push(
      generatePoolHTML(
        pool,
        {
          title: `Poule ${pool.number} — ${competitionTitle}`,
          logoBase64: logo,
          competitionName: competitionTitle,
          signatures: poolSignatures?.[pool.id],
        },
        undefined
      )
    );
  }

  if (overallRanking.length > 0) {
    const rankCols = isLaserSabre
      ? [
          'rank',
          'lastName',
          'firstName',
          'club',
          'victories',
          'ratio',
          'td',
          'tr',
          'quest',
          'index',
        ]
      : ['rank', 'lastName', 'firstName', 'club', 'victories', 'ratio', 'td', 'tr', 'index'];
    sections.push(
      generateRankingHTML(
        overallRanking,
        `Classement provisoire — ${competitionTitle}`,
        isLaserSabre,
        rankCols,
        logo,
        template
      )
    );
  }

  const rounds = [...new Set(tableauMatches.map(m => m.round))].sort((a, b) => b - a);
  for (const round of rounds) {
    const roundMatches = tableauMatches.filter(m => m.round === round && !m.isBye);
    if (roundMatches.length === 0) continue;
    sections.push(
      generateTableauHTML(
        roundMatches,
        MAX_MATCHES_PER_PAGE_TABLEAU,
        `${getTableauRoundName(round)} — ${competitionTitle}`,
        logo,
        undefined,
        true,
        tableauSignatures
      )
    );
  }

  for (const bracket of consolationBrackets) {
    const bRounds = [...new Set(bracket.matches.map(m => m.round))].sort((a, b) => b - a);
    for (const round of bRounds) {
      const roundMatches = bracket.matches.filter(m => m.round === round && !m.isBye);
      if (roundMatches.length === 0) continue;
      sections.push(
        generateTableauHTML(
          roundMatches,
          MAX_MATCHES_PER_PAGE_TABLEAU,
          `${bracket.name} — ${getTableauRoundName(round)} — ${competitionTitle}`,
          logo,
          undefined,
          true,
          tableauSignatures
        )
      );
    }
  }

  if (finalResults.length > 0) {
    sections.push(
      generateResultsHTML(finalResults, `Classement final — ${competitionTitle}`, logo, undefined)
    );
  }

  if (sections.length === 0) throw new Error('Aucune donnée à exporter');

  const allStyles = sections.map(extractStyleContent).join('\n');
  const allBodies = sections
    .map(
      (html, i) =>
        (i === 0 ? '' : '<div class="full-export-break"></div>\n') + extractBodyContent(html)
    )
    .join('\n');

  const combined = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Export complet — ${competitionTitle}</title>
  <style>
    ${allStyles}
    .full-export-break { break-before: page; }
  </style>
</head>
<body>
${allBodies}
</body>
</html>`;

  await savePDF(combined, `export-PDF_full.pdf`);
}

// ─── Export poules + tableaux sans signature ───────────────────────────────────

export interface NoSignatureExportData {
  pools: Pool[];
  tableauMatches: TableauMatchForPDF[];
  consolationBrackets: { id: string; name: string; matches: TableauMatchForPDF[] }[];
  competitionTitle: string;
  template?: PdfTemplate;
}

/**
 * Exporte uniquement les poules et les tableaux d'élimination directe,
 * sans les signatures des combattants (aucune signature n'est transmise aux générateurs).
 */
export async function exportPoolsAndTableauxNoSignaturePDF(
  data: NoSignatureExportData
): Promise<void> {
  const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
  const { pools, tableauMatches, consolationBrackets, competitionTitle, template } = data;

  const sections: string[] = [];

  for (const pool of pools) {
    sections.push(
      generatePoolHTML(
        pool,
        {
          title: `Poule ${pool.number} — ${competitionTitle}`,
          logoBase64: logo,
          competitionName: competitionTitle,
        },
        template
      )
    );
  }

  const rounds = [...new Set(tableauMatches.map(m => m.round))].sort((a, b) => b - a);
  for (const round of rounds) {
    const roundMatches = tableauMatches.filter(m => m.round === round && !m.isBye);
    if (roundMatches.length === 0) continue;
    sections.push(
      generateTableauHTML(
        roundMatches,
        MAX_MATCHES_PER_PAGE_TABLEAU,
        `${getTableauRoundName(round)} — ${competitionTitle}`,
        logo,
        template,
        true
      )
    );
  }

  for (const bracket of consolationBrackets) {
    const bRounds = [...new Set(bracket.matches.map(m => m.round))].sort((a, b) => b - a);
    for (const round of bRounds) {
      const roundMatches = bracket.matches.filter(m => m.round === round && !m.isBye);
      if (roundMatches.length === 0) continue;
      sections.push(
        generateTableauHTML(
          roundMatches,
          MAX_MATCHES_PER_PAGE_TABLEAU,
          `${bracket.name} — ${getTableauRoundName(round)} — ${competitionTitle}`,
          logo,
          template,
          true
        )
      );
    }
  }

  if (sections.length === 0) throw new Error('Aucune donnée à exporter');

  const allStyles = sections.map(extractStyleContent).join('\n');
  const allBodies = sections
    .map(
      (html, i) =>
        (i === 0 ? '' : '<div class="full-export-break"></div>\n') + extractBodyContent(html)
    )
    .join('\n');

  const combined = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Export sans signature — ${competitionTitle}</title>
  <style>
    ${allStyles}
    .full-export-break { break-before: page; }
  </style>
</head>
<body>
${allBodies}
</body>
</html>`;

  await savePDF(combined, `export-PDF_sans-signature.pdf`);
}
