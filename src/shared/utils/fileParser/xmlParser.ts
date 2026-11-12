/**
 * BellePoule Modern - File Parser - Format XML BellePoule
 * Licensed under GPL-3.0
 */

import { FencerStatus, Gender } from '../../types';
import { normalizeDepartment } from '../departments';
import { ImportResult, ImportedReferee } from './common';

/** Lecteur d'attributs d'une balise ouvrante */
function attrReader(tag: string): (attr: string) => string {
  return attr => {
    const m = tag.match(new RegExp(`\\s${attr}="([^"]*)"`));
    return m ? m[1] : '';
  };
}

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
 * Parse un fichier XML BellePoule
 */
export function parseXMLFile(content: string): ImportResult {
  const result: ImportResult = {
    success: false,
    fencers: [],
    errors: [],
    warnings: [],
  };

  try {
    // Parse simple du XML (sans DOMParser côté Node)
    for (const match of content.matchAll(/<Tireur(?=[\s/>])[^>]*>/g)) {
      const getName = attrReader(match[0]);

      const lastName = getName('Nom');
      const firstName = getName('Prenom');

      if (lastName && firstName) {
        const lat = getName('Lateralite').toUpperCase();
        result.fencers.push({
          lastName: lastName.toUpperCase(),
          firstName,
          gender: parseGender(getName('Sexe')),
          nationality: getName('Nation') || 'FRA',
          region: getName('Ligue') || undefined,
          department: parseDepartment(getName('Departement')),
          club: getName('Club') || undefined,
          license: getName('Licence') || undefined,
          ranking: parseInt(getName('Classement')) || undefined,
          ...(lat === 'G' || lat === 'L' ? { handedness: 'L' as const } : {}),
          ...(lat === 'D' || lat === 'R' ? { handedness: 'R' as const } : {}),
          status: FencerStatus.NOT_CHECKED_IN,
        });
      }
    }

    if (/<Arbitres[\s>]/.test(content)) result.referees = parseReferees(content);

    result.success = result.fencers.length > 0 || (result.referees?.length ?? 0) > 0;
  } catch (error) {
    result.errors.push(`Erreur de parsing XML: ${error}`);
  }

  return result;
}
