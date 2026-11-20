/**
 * BellePoule Modern - File Parser - Format XML BellePoule
 * Licensed under GPL-3.0
 */

import { FencerStatus, Gender } from '../../types';
import { normalizeDepartment } from '../departments';
import {
  ImportResult,
  ImportedReferee,
  ImportedTeam,
  attrReader,
  fencerKey,
  parseFrenchDate,
} from './common';

function parseGender(raw: string): Gender {
  if (raw === 'M') return Gender.MALE;
  if (raw === 'F') return Gender.FEMALE;
  return Gender.MIXED;
}

/** Code département normalisé (095 -> 95, #1504) ; valeur brute si non reconnue */
function parseDepartment(raw: string): string | undefined {
  if (!raw) return undefined;
  return normalizeDepartment(raw) || raw;
}

/** Arbitres du bloc <Arbitres> (#1504) */
function parseReferees(content: string): ImportedReferee[] {
  const referees: ImportedReferee[] = [];
  for (const match of content.matchAll(/<Arbitre(?=[\s/>])[^>]*>/g)) {
    const get = attrReader(match[0]);
    const lastName = get('Nom');
    const firstName = get('Prenom');
    if (!lastName && !firstName) continue;
    const gender = parseGender(get('Sexe'));
    referees.push({
      lastName: lastName.toUpperCase(),
      firstName,
      gender: gender === Gender.MIXED ? Gender.MALE : gender,
      nationality: get('Nation') || 'FRA',
      region: get('Ligue') || undefined,
      club: get('Club') || undefined,
      license: get('Licence') || undefined,
      category: get('Categorie') || undefined,
    });
  }
  return referees;
}

/**
 * Noms des équipes de la section <Equipes> (spécification FIE : ID référencé par l'attribut
 * Equipe des tireurs, nom dans Nom si présent). L'extranet FFE laisse la section vide et
 * met directement le nom d'équipe dans l'attribut Equipe.
 */
function parseTeamSection(content: string): Map<string, { name: string; club?: string }> {
  const teams = new Map<string, { name: string; club?: string }>();
  const section = content.match(/<Equipes(?=[\s>])[\s\S]*?<\/Equipes>/);
  if (!section) return teams;
  for (const match of section[0].matchAll(/<Equipe(?=[\s/>])[^>]*>/g)) {
    const get = attrReader(match[0]);
    const id = get('ID');
    if (id) teams.set(id, { name: get('Nom') || id, club: get('Club') || undefined });
  }
  return teams;
}

/** Équipes reconstituées depuis l'attribut Equipe des tireurs, dans l'ordre du fichier */
function collectTeams(
  members: Array<{ ref: string; key: string; club?: string }>,
  section: Map<string, { name: string; club?: string }>
): ImportedTeam[] {
  const byName = new Map<string, ImportedTeam>();
  for (const { ref, key, club } of members) {
    const known = section.get(ref);
    const name = known?.name ?? ref;
    let team = byName.get(name);
    if (!team) {
      team = { name, club: known?.club ?? club, members: [] };
      byName.set(name, team);
    }
    team.members.push(key);
  }
  return [...byName.values()];
}

/**
 * Parse un fichier XML BellePoule / FFE / FIE
 */
export function parseXMLFile(content: string): ImportResult {
  const result: ImportResult = {
    success: false,
    fencers: [],
    errors: [],
    warnings: [],
  };

  try {
    const teamMembers: Array<{ ref: string; key: string; club?: string }> = [];
    // Parse simple du XML (sans DOMParser côté Node)
    for (const match of content.matchAll(/<Tireur(?=[\s/>])[^>]*>/g)) {
      const getName = attrReader(match[0]);

      const lastName = getName('Nom');
      const firstName = getName('Prenom');

      if (lastName && firstName) {
        const lat = getName('Lateralite').toUpperCase();
        const fencer = {
          lastName: lastName.toUpperCase(),
          firstName,
          gender: parseGender(getName('Sexe')),
          nationality: getName('Nation') || 'FRA',
          region: getName('Ligue') || undefined,
          department: parseDepartment(getName('Departement')),
          club: getName('Club') || undefined,
          license: getName('Licence') || undefined,
          ranking: parseInt(getName('Classement')) || undefined,
          birthDate: parseFrenchDate(getName('DateNaissance')),
          ...(lat === 'G' || lat === 'L' ? { handedness: 'L' as const } : {}),
          ...(lat === 'D' || lat === 'R' ? { handedness: 'R' as const } : {}),
          status: FencerStatus.NOT_CHECKED_IN,
        };
        result.fencers.push(fencer);
        const teamRef = getName('Equipe');
        if (teamRef) teamMembers.push({ ref: teamRef, key: fencerKey(fencer), club: fencer.club });
      }
    }

    if (teamMembers.length > 0) {
      result.teams = collectTeams(teamMembers, parseTeamSection(content));
    }

    if (/<Arbitres[\s>]/.test(content)) result.referees = parseReferees(content);

    result.success = result.fencers.length > 0 || (result.referees?.length ?? 0) > 0;
  } catch (error) {
    result.errors.push(`Erreur de parsing XML: ${error}`);
  }

  return result;
}
