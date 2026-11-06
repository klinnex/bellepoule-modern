/**
 * BellePoule Modern - États initiaux des modales de TableauView + signatures PDF (#1241)
 * Licensed under GPL-3.0
 */
import type { TableauMatch } from './tableauTypes';
import { MAX_MATCHES_PER_PAGE_TABLEAU } from '../../../shared/utils/pdfConstants';

export const SCORE_EDIT_INIT = {
  editingMatch: null as string | null,
  editingConsolationId: null as string | null,
  showScoreModal: false,
  editScoreA: '',
  editScoreB: '',
  victoryA: false,
  victoryB: false,
};

export const ASSIGN_MODALS_INIT = {
  showArenaModal: false,
  selectedMatchForArena: null as string | null,
  showRefereeModal: false,
  signaturesMatch: null as TableauMatch | null,
  selectedMatchForReferee: null as string | null,
  selectedMatchConsolationBracketId: null as string | null,
};

export const PDF_DIALOG_INIT = {
  showPdfModal: false,
  pdfMode: 'pdf' as 'print' | 'pdf',
  pdfMatchesPerPage: MAX_MATCHES_PER_PAGE_TABLEAU,
  selectedRounds: new Set<number>(),
};

export type DESignatures = Record<string, { A?: string; B?: string }>;

/** Signatures des tireurs saisies sur tablette (optionnelles : échec silencieux). */
export async function loadDESignatures(matches: TableauMatch[]): Promise<DESignatures | undefined> {
  try {
    const api = (window as any).electronAPI;
    const ids = matches.map(m => m.id).filter(Boolean);
    const rows = (await api?.db?.getDEMatchSignaturesByMatchIds?.(ids)) ?? [];
    if (rows.length === 0) return undefined;
    const signatures: DESignatures = {};
    for (const row of rows) {
      const match = matches.find(m => m.id === row.matchId);
      if (!match) continue;
      const slot =
        match.fencerA?.id === row.fencerId ? 'A' : match.fencerB?.id === row.fencerId ? 'B' : null;
      if (!slot) continue;
      (signatures[row.matchId] ??= {})[slot] = row.signatureData;
    }
    return signatures;
  } catch {
    return undefined;
  }
}
