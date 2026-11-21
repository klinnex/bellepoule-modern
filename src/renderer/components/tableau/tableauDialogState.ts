/**
 * BellePoule Modern - États initiaux des modales de TableauView + signatures PDF (#1241)
 * Licensed under GPL-3.0
 */
import type { TableauMatch } from '../../../shared/domain/tableau/tableauTypes';
import { MAX_MATCHES_PER_PAGE_TABLEAU } from '../../../shared/utils/pdfConstants';
import type { BpmClient } from '../../../shared/api/client';
import { defaultBpmClient } from '../../api/IpcClient';

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
    const api = window.electronAPI;
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

export type DECards = Record<string, { A?: string[]; B?: string[] }>;

/**
 * Cartons des matchs de tableau pour les feuilles imprimées (#1829), rangés par côté A/B.
 * Un match de tableau saisi à distance est enregistré sous l'id composite
 * `<compétition>-<match>`, sinon sous son id : les deux sont lus. Optionnels : échec silencieux.
 */
export async function loadDECards(
  matches: TableauMatch[],
  competitionId?: string,
  client: BpmClient = defaultBpmClient
): Promise<DECards | undefined> {
  try {
    const dbIdToMatch = new Map<string, TableauMatch>();
    for (const m of matches) {
      if (!m.id) continue;
      dbIdToMatch.set(m.id, m);
      if (competitionId) dbIdToMatch.set(`${competitionId}-${m.id}`, m);
    }
    if (dbIdToMatch.size === 0) return undefined;
    // Contrat d'API (#1981) : requête getCardsByMatchIds ; hors Electron, échec silencieux
    const rows = await client.query('getCardsByMatchIds', { matchIds: [...dbIdToMatch.keys()] });
    // Match saisi à distance : seules ses lignes sous l'id composite comptent (pas de doublon
    // avec d'éventuelles lignes sous l'id simple)
    const remoteIds = new Set(
      rows
        .filter(
          r => competitionId && r.matchId === `${competitionId}-${dbIdToMatch.get(r.matchId)?.id}`
        )
        .map(r => dbIdToMatch.get(r.matchId)!.id)
    );
    const cards: DECards = {};
    for (const row of rows) {
      const match = dbIdToMatch.get(row.matchId);
      if (!match) continue;
      if (row.matchId === match.id && remoteIds.has(match.id)) continue;
      const slot =
        match.fencerA?.id === row.fencerId ? 'A' : match.fencerB?.id === row.fencerId ? 'B' : null;
      if (!slot) continue;
      ((cards[match.id] ??= {})[slot] ??= []).push(row.cardType);
    }
    return Object.keys(cards).length > 0 ? cards : undefined;
  } catch {
    return undefined;
  }
}
