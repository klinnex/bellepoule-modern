/**
 * BellePoule Modern - Couche domaine : export des résultats depuis le main (#1880, lot 3)
 * XML BellePoule/FFE, FFF (Windows-1252), CSV du classement après poules, HTML et PDF.
 * Mêmes générateurs que l'écran ; le PDF passe par une fenêtre cachée (injectée).
 * Licensed under GPL-3.0
 */
import type { Competition } from '../../shared/types';
import { exportRankingCSV, exportResultsXMLFFE } from '../../shared/utils/multiFormatExport';
import { encodeFFFWin1252, exportResultsToFFF } from '../../shared/utils/fencerExport';
import { generateResultsHTML } from '../../shared/utils/pdfExport/resultsPdf';
import { DomainError, type DomainContext } from './context';
import { resultsData } from './sport';
import { resolveOutputPath, writeOutputFile } from './files';

export type ResultsFormat = 'xml' | 'fff' | 'csv' | 'html' | 'pdf';

const EXTENSION: Record<ResultsFormat, string> = {
  xml: '.xml',
  fff: '.fff',
  csv: '.csv',
  html: '.html',
  pdf: '.pdf',
};

export interface ExportResultsOptions {
  format: ResultsFormat;
  /** Fichier de sortie : chemin absolu, extension du format */
  outputPath: string;
  overwrite?: boolean;
  /** Rendu PDF (fenêtre cachée du main) ; absent : PDF indisponible */
  renderPdf?: (html: string) => Promise<Buffer>;
  /** Logo des documents (paramètres du poste) */
  logo?: string | null;
}

export async function exportResults(
  ctx: DomainContext,
  competitionId: string,
  options: ExportResultsOptions
): Promise<{ path: string; format: ResultsFormat; bytes: number }> {
  const overwrite = !!options.overwrite;
  const target = resolveOutputPath(options.outputPath, EXTENSION[options.format], {
    overwrite,
    roots: ctx.allowedRoots?.(),
  });
  const data = resultsData(ctx, competitionId);
  const competition = data.competition as Competition;
  const needFinal =
    options.format === 'fff' || options.format === 'html' || options.format === 'pdf';
  if (needFinal && data.finalResults.length === 0) {
    throw new DomainError(
      'no_final_results',
      'Classement final indisponible : tableau non terminé'
    );
  }
  if (options.format === 'csv' && data.overallRanking.length === 0) {
    throw new DomainError('no_ranking', 'Classement après poules indisponible');
  }
  let content: string | Uint8Array;
  switch (options.format) {
    case 'xml':
      content = exportResultsXMLFFE(
        competition,
        data.overallRanking,
        data.finalResults,
        data.pools,
        data.tableauMatches.map(m => ({
          round: m.round,
          fencerA: m.fencerA ? { ref: m.fencerA.ref } : null,
          fencerB: m.fencerB ? { ref: m.fencerB.ref } : null,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          isBye: m.isBye,
          arena: m.arena ?? null,
          referee: m.referee ? { id: m.referee.id } : null,
          referees: m.referees?.map(r => ({ id: r.id })),
        })),
        data.fencers,
        data.referees
      );
      break;
    case 'fff':
      content = encodeFFFWin1252(exportResultsToFFF(competition, data.finalResults));
      break;
    case 'csv':
      content = exportRankingCSV(data.overallRanking);
      break;
    case 'html':
    case 'pdf': {
      const html = generateResultsHTML(
        data.finalResults,
        competition.title,
        options.logo ?? undefined
      );
      if (options.format === 'html') {
        content = html;
        break;
      }
      if (!options.renderPdf) throw new DomainError('pdf_unavailable', 'Rendu PDF indisponible');
      content = await options.renderPdf(html);
      break;
    }
  }
  await writeOutputFile(target, content, overwrite);
  return {
    path: target,
    format: options.format,
    bytes: typeof content === 'string' ? Buffer.byteLength(content) : content.byteLength,
  };
}
