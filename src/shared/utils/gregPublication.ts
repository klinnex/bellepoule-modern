/**
 * BellePoule Modern - Publication GREG (escrime-info.com) : mapping des champs du formulaire (#1328)
 * Valeurs reprises de l'ancien BellePoule (greg_uploader.cpp, contest.cpp, category.cpp, application.cpp).
 * Licensed under GPL-3.0
 */

import { Category, Competition, Gender, Weapon } from '../types';

export const GREG_UPLOAD_URL = 'http://www.escrime-info.com/gregxml/Greg/envoyer.php';

/** Niveau GREG « Autre » : la compétition n'a pas encore de champ niveau (voir #1328) */
export const GREG_DEFAULT_LEVEL = 'X';

export type GregCompetition = Pick<
  Competition,
  'title' | 'date' | 'location' | 'weapon' | 'gender' | 'category' | 'isTeamEvent' | 'status'
>;

export interface GregFormFields {
  type_competition: string;
  indivouequipe: string;
  'dp-normal-1': string;
  lieu: string;
  niveau: string;
  Division: string;
  arme: string;
  genre: string;
  categorie: string;
  status: string;
}

/** Champs acceptés par le serveur GREG côté main : toute autre clé est refusée */
export const GREG_FIELD_NAMES: readonly (keyof GregFormFields)[] = [
  'type_competition',
  'indivouequipe',
  'dp-normal-1',
  'lieu',
  'niveau',
  'Division',
  'arme',
  'genre',
  'categorie',
  'status',
];

const GENDER_GREG: Record<Gender, string> = {
  [Gender.MALE]: 'H',
  [Gender.FEMALE]: 'D',
  [Gender.MIXED]: 'H',
};

/** Armes GREG : seules l'épée, le fleuret et le sabre sont publiables */
const WEAPON_GREG: Partial<Record<Weapon, string>> = {
  [Weapon.EPEE]: 'E',
  [Weapon.FOIL]: 'F',
  [Weapon.SABRE]: 'S',
};

const CATEGORY_GREG: Partial<Record<Category, string>> = {
  [Category.U9]: 'M9',
  [Category.U11]: 'M11',
  [Category.U13]: 'M13',
  [Category.U15]: 'M15',
  [Category.U17]: 'M17',
  [Category.U20]: 'M20',
  [Category.SENIOR]: 'S',
  [Category.V1]: 'V1',
  [Category.V2]: 'V2',
  [Category.V3]: 'V3',
  [Category.V4]: 'V4',
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Nom du fichier envoyé : sans caractères spéciaux, extension .xml */
export function gregFileName(title: string): string {
  return `resultats_${title.replace(/[^a-z0-9]/gi, '_')}.xml`;
}

/**
 * Champs du formulaire GREG. Lève une erreur si la compétition ne peut pas être publiée
 * (le serveur refuse une compétition sans lieu, l'ancien BellePoule n'envoyait rien dans ce cas).
 */
export function buildGregFields(competition: GregCompetition): GregFormFields {
  const weapon = WEAPON_GREG[competition.weapon];
  if (!weapon) throw new Error('Arme non publiable sur GREG (épée, fleuret ou sabre uniquement)');

  const category = CATEGORY_GREG[competition.category];
  if (!category) throw new Error('Catégorie non publiable sur GREG');

  const location = competition.location?.trim();
  if (!location) throw new Error('Le lieu de la compétition est requis pour GREG');

  const d = competition.date;
  return {
    type_competition: competition.isTeamEvent ? 'CompetitionParEquipes' : 'CompetitionIndividuelle',
    indivouequipe: competition.isTeamEvent ? 'equipe' : 'indiv',
    'dp-normal-1': `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`,
    lieu: location,
    niveau: GREG_DEFAULT_LEVEL,
    Division: '',
    arme: weapon,
    genre: GENDER_GREG[competition.gender],
    categorie: category,
    status: competition.status === 'completed' ? 'D' : 'L',
  };
}

/**
 * L'export BellePoule écrit `<CompetitionParEquipe>` ; l'ancien fichier natif, et donc le formulaire
 * GREG, utilisent le pluriel `<CompetitionParEquipes>`. Remplacement exact des balises racine.
 */
export function toGregRootTag(xml: string, isTeamEvent: boolean): string {
  if (!isTeamEvent) return xml;
  return xml
    .replace('<CompetitionParEquipe ', '<CompetitionParEquipes ')
    .replace('</CompetitionParEquipe>', '</CompetitionParEquipes>');
}
