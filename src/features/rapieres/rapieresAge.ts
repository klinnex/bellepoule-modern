/**
 * BellePoule Modern - Tournoi des rapières : âge et catégorie des équipes (#1441)
 * Catégorie d'équipe = moyenne des années de naissance des deux tireurs
 * ((naissance 1 + naissance 2) / 2), appliquée aux tranches d'âge de la saison.
 * Sexe d'équipe : M / F / mixte (un homme et une femme).
 * Licensed under GPL-3.0
 */

import {
  RapieresAgeCategory,
  RapieresFencer,
  RapieresTeamGender,
  RapieresTeamInfo,
} from './rapieres.types';

/** Année de naissance d'un tireur (depuis sa date AAAA-MM-JJ), sinon undefined */
export function rapieresBirthYear(fencer: Pick<RapieresFencer, 'birthDate'>): number | undefined {
  const m = /^(\d{4})-\d{1,2}-\d{1,2}/.exec(fencer.birthDate ?? '');
  return m ? Number(m[1]) : undefined;
}

/**
 * Catégorie d'âge pour une année de naissance (éventuellement moyenne décimale) :
 * âge = année de début de saison (1er septembre) − année de naissance.
 * M20 < 20 ans, Seniors 20-39, V1 40-49, V2 50-59, V3 60-69, V4 70+.
 */
export function rapieresCategoryFromBirthYear(
  birthYear: number,
  refDate: Date = new Date()
): RapieresAgeCategory {
  const seasonStart = refDate.getMonth() >= 8 ? refDate.getFullYear() : refDate.getFullYear() - 1;
  const age = seasonStart - birthYear;
  if (age < 20) return 'M20';
  if (age < 40) return 'SENIOR';
  if (age < 50) return 'V1';
  if (age < 60) return 'V2';
  if (age < 70) return 'V3';
  return 'V4';
}

/**
 * Catégorie d'une équipe : moyenne des années de naissance connues (les deux tireurs,
 * ou le seul renseigné). Sans aucune date : catégorie saisie des tireurs (héritée).
 */
export function rapieresTeamCategory(
  info: RapieresTeamInfo,
  refDate: Date = new Date()
): RapieresAgeCategory {
  const years = info.fencers
    .map(rapieresBirthYear)
    .filter((y): y is number => typeof y === 'number');
  if (years.length > 0) {
    const average = years.reduce((sum, y) => sum + y, 0) / years.length;
    return rapieresCategoryFromBirthYear(average, refDate);
  }
  return info.fencers.find(f => f.category)?.category ?? 'SENIOR';
}

/** Sexe d'une équipe ; undefined si un des deux sexes n'est pas renseigné */
export function rapieresTeamGender(info: RapieresTeamInfo): RapieresTeamGender | undefined {
  const [a, b] = info.fencers.map(f => f.gender);
  if (!a || !b) return undefined;
  return a === b ? a : 'MIXED';
}
