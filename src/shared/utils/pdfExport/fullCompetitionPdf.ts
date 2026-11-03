/**
 * BellePoule Modern - PDF Export Service
 * Export PDF complet d'une compétition (appel, poules, classements, tableaux, résultats)
 * Licensed under GPL-3.0
 */

import { Fencer, Pool, PoolRanking } from '../../types';
import type { PdfTemplate } from '../../types/pdfTemplate.types';
import { MAX_MATCHES_PER_PAGE_TABLEAU } from '../pdfConstants';
import { savePDF, pdfLang, pdfT } from './core';
import { generatePoolHTML } from './poolPdf';
import { TableauMatchForPDF, generateTableauHTML, getTableauRoundName } from './tableauPdf';
import { generateRankingHTML } from './rankingPdf';
import { FinalResultForPDF, generateResultsHTML } from './resultsPdf';
import { generateAppelHTML } from './appelPdf';
import type { BookSectionKind } from './bookToc';
import { exportBookPDF, extractBodyContent, extractStyleContent } from './bookPdf';

// ─── Export complet compétition ───────────────────────────────────────────────

export interface FullCompetitionExportData {
  fencers: Fencer[];
  /** Colonnes visibles de la feuille d'appel (respecte la config UI) */
  appelVisibleColumns?: string[];
  /** Appel figé de chaque tour de poules terminé ; `fencers` = appel du dernier tour (#1051) */
  appelHistory?: Fencer[][];
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
  /** Types de sections inclus, dans l'ordre d'impression (#1325) ; défaut : tout, ordre d'origine */
  sectionOrder?: BookSectionKind[];
}

export async function exportFullCompetitionPDF(data: FullCompetitionExportData): Promise<void> {
  const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
  const {
    fencers,
    appelVisibleColumns,
    appelHistory = [],
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
    sectionOrder,
  } = data;

  const items: { kind: BookSectionKind; title: string; html: string }[] = [];
  const add = (kind: BookSectionKind, title: string, html: string) => {
    items.push({ kind, title, html });
  };

  const appelCols = appelVisibleColumns ?? [
    'ref',
    'lastName',
    'firstName',
    'birthDate',
    'club',
    'ranking',
    'status',
  ];
  const byRanking = (list: Fencer[]) =>
    [...list].sort(
      (a, b) =>
        (a.ranking ?? Infinity) - (b.ranking ?? Infinity) || a.lastName.localeCompare(b.lastName)
    );
  // Plusieurs tours : une feuille d'appel par tour terminé, puis celle du tour courant
  const appelRounds = appelHistory.filter(r => r.length > 0);
  appelRounds.forEach((roundFencers, i) => {
    const title = `${pdfT('appel_sheet', "Feuille d'appel")} — ${pdfT('round_n', 'Tour {{n}}', { n: i + 1 })}`;
    add(
      'appel',
      title,
      generateAppelHTML(
        byRanking(roundFencers),
        appelCols,
        `${title} — ${competitionTitle}`,
        competitionTitle,
        logo,
        undefined
      )
    );
  });

  if (fencers.length > 0) {
    // Si les tireurs viennent de l'appel, ils sont déjà triés ; sinon tri par défaut
    const appelFencerList = appelVisibleColumns ? fencers : byRanking(fencers);
    const roundLabel =
      appelRounds.length > 0
        ? `${pdfT('round_n', 'Tour {{n}}', { n: appelRounds.length + 1 })} — `
        : '';
    add(
      'appel',
      `${pdfT('appel_sheet', "Feuille d'appel")}${roundLabel ? ` — ${roundLabel.replace(/ — $/, '')}` : ''}`,
      generateAppelHTML(
        appelFencerList,
        appelCols,
        `${pdfT('appel_sheet', "Feuille d'appel")} — ${roundLabel}${competitionTitle}`,
        competitionTitle,
        logo,
        undefined
      )
    );
  }

  for (const pool of pools) {
    add(
      'pools',
      pdfT('pool_n', 'Poule {{n}}', { n: pool.number }),
      generatePoolHTML(
        pool,
        {
          title: `${pdfT('pool_n', 'Poule {{n}}', { n: pool.number })} — ${competitionTitle}`,
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
    add(
      'ranking',
      pdfT('provisional_ranking', 'Classement provisoire'),
      generateRankingHTML(
        overallRanking,
        `${pdfT('provisional_ranking', 'Classement provisoire')} — ${competitionTitle}`,
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
    add(
      'tableau',
      getTableauRoundName(round),
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
      add(
        'consolation',
        `${bracket.name} — ${getTableauRoundName(round)}`,
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
    add(
      'results',
      pdfT('final_ranking', 'Classement final'),
      generateResultsHTML(
        finalResults,
        `${pdfT('final_ranking', 'Classement final')} — ${competitionTitle}`,
        logo,
        undefined
      )
    );
  }

  await exportBookPDF({
    items,
    sectionOrder,
    competitionTitle,
    bookTitle: `${pdfT('full_export', 'Export complet')} — ${competitionTitle}`,
    filename: 'export-PDF_full.pdf',
    logo,
  });
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
          title: `${pdfT('pool_n', 'Poule {{n}}', { n: pool.number })} — ${competitionTitle}`,
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

  if (sections.length === 0) throw new Error(pdfT('no_data', 'Aucune donnée à exporter'));

  const allStyles = sections.map(extractStyleContent).join('\n');
  const allBodies = sections
    .map(
      (html, i) =>
        (i === 0 ? '' : '<div class="full-export-break"></div>\n') + extractBodyContent(html)
    )
    .join('\n');

  const combined = `<!DOCTYPE html>
<html lang="${pdfLang()}">
<head>
  <meta charset="UTF-8">
  <title>${pdfT('export_no_signature', 'Export sans signature')} — ${competitionTitle}</title>
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
