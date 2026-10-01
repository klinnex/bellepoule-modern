/**
 * BellePoule Modern - Compétition couplée : création d'une compétition séparée
 * Après les poules, un groupe (ex : les filles) est extrait dans une compétition à part
 * qui démarre directement au classement après poules.
 * Licensed under GPL-3.0
 */

import {
  Competition,
  CompetitionSettings,
  Fencer,
  FencerStatus,
  Gender,
  PoolRanking,
} from '../types';
import { splitRankingByGender } from './poolCalculations';

/** Libellé par défaut proposé pour la compétition séparée */
export function defaultSplitCompetitionTitle(baseTitle: string, group: string): string {
  const suffix = group === Gender.FEMALE ? 'Dames' : group === Gender.MALE ? 'Hommes' : group;
  return `${baseTitle} – ${suffix}`;
}

/** Données de création de la compétition séparée (mêmes paramètres, sans le mode couplé) */
export function buildSplitCompetitionData(
  source: Competition,
  title: string,
  group: string
): Partial<Competition> {
  const {
    postPoolSplitCriteria: _criteria,
    splitOffCompetitionIds: _splitOff,
    poolWinnersOnly: _winners,
    ...settings
  } = source.settings ?? ({} as CompetitionSettings);
  return {
    title: title.trim(),
    date: source.date,
    location: source.location,
    weapon: source.weapon,
    gender: group as Gender,
    category: source.category,
    color: source.color,
    settings: { ...settings, splitFromCompetitionId: source.id } as CompetitionSettings,
  };
}

/** Classement du groupe à extraire (rangs renumérotés à partir de 1) */
export function extractSplitGroupRanking(
  overallRanking: PoolRanking[],
  group: string
): PoolRanking[] {
  return splitRankingByGender(overallRanking).get(group) ?? [];
}

/** Données tireur à recréer dans la compétition séparée (ranking = rang après poules) */
export function toSplitFencerData(r: PoolRanking): Partial<Fencer> {
  const f = r.fencer;
  return {
    lastName: f.lastName,
    firstName: f.firstName,
    birthDate: f.birthDate,
    gender: f.gender,
    nationality: f.nationality,
    region: f.region,
    club: f.club,
    license: f.license,
    ranking: r.rank,
    status: f.status === FencerStatus.NOT_CHECKED_IN ? FencerStatus.CHECKED_IN : f.status,
    photo: f.photo,
  };
}

/** Remplace les tireurs du classement par leurs copies créées dans la nouvelle compétition */
export function remapRankingFencers(
  ranking: PoolRanking[],
  newFencerByOldId: Map<string, Fencer>
): PoolRanking[] {
  return ranking
    .filter(r => newFencerByOldId.has(r.fencer.id))
    .map(r => ({
      ...r,
      fencer: { ...newFencerByOldId.get(r.fencer.id)!, poolStats: r.fencer.poolStats },
    }));
}
