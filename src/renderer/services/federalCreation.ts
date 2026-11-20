/**
 * BellePoule Modern - Création des tireurs, équipes et arbitres lus dans les fichiers
 * de l'extranet, juste après la création de la compétition (#1938)
 * Licensed under GPL-3.0
 */
import type { Fencer } from '../../shared/types';
import { fencerKey } from '../../shared/utils/fileParser/common';
import { logger, LogCategory } from '../../shared/services/logger';
import type { FederalCreationPayload } from '../hooks/useFederalImport';

export interface FederalCreationCounts {
  fencers: number;
  teams: number;
  referees: number;
}

/**
 * Crée tireurs, équipes (nom de l'extranet conservé ; titulaires dans l'ordre du fichier,
 * puis réservistes) et arbitres. Un échec unitaire est journalisé sans interrompre le reste.
 */
export async function applyFederalImport(
  competitionId: string,
  payload: FederalCreationPayload,
  starters: number
): Promise<FederalCreationCounts> {
  const db = window.electronAPI.db;
  const counts: FederalCreationCounts = { fencers: 0, teams: 0, referees: 0 };
  const created = new Map<string, Fencer>();

  for (const data of payload.fencers) {
    try {
      const fencer = await db.addFencer(competitionId, data as Parameters<typeof db.addFencer>[1]);
      created.set(fencerKey(data), fencer);
      counts.fencers++;
    } catch (err) {
      logger.error(LogCategory.UI, 'Federal import: fencer not created', err as Error);
    }
  }

  for (const team of payload.teams) {
    try {
      const { id } = await db.createTeam(competitionId, team.name, team.club || team.name);
      counts.teams++;
      let order = 0;
      for (const key of team.members) {
        const fencer = created.get(key);
        if (!fencer) continue;
        order++;
        await db.upsertTeamFencer(id, fencer.id, order, order > starters);
      }
    } catch (err) {
      logger.error(LogCategory.UI, 'Federal import: team not created', err as Error);
    }
  }

  for (const ref of payload.referees) {
    try {
      await db.createReferee(competitionId, {
        name: `${ref.firstName} ${ref.lastName}`.trim(),
        club: ref.club,
        license: ref.license,
        category: ref.category,
        nationality: ref.nationality,
        gender: ref.gender,
      });
      counts.referees++;
    } catch (err) {
      logger.error(LogCategory.UI, 'Federal import: referee not created', err as Error);
    }
  }

  return counts;
}
