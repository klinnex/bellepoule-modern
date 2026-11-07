/**
 * BellePoule Modern - File Parser - Format XML BellePoule
 * Licensed under GPL-3.0
 */

import { FencerStatus, Gender } from '../../types';
import { ImportResult } from './common';

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
    const tireurMatches = content.matchAll(/<Tireur[^>]*>/g);

    for (const match of tireurMatches) {
      const tag = match[0];

      const getName = (attr: string): string => {
        const m = tag.match(new RegExp(`${attr}="([^"]*)"`));
        return m ? m[1] : '';
      };

      const lastName = getName('Nom');
      const firstName = getName('Prenom');

      if (lastName && firstName) {
        const genderStr = getName('Sexe');
        let gender: Gender = Gender.MIXED;
        if (genderStr === 'M') gender = Gender.MALE;
        else if (genderStr === 'F') gender = Gender.FEMALE;

        result.fencers.push({
          lastName: lastName.toUpperCase(),
          firstName,
          gender,
          nationality: getName('Nation') || 'FRA',
          region: getName('Ligue') || undefined,
          department: getName('Departement') || undefined,
          club: getName('Club') || undefined,
          license: getName('Licence') || undefined,
          ranking: parseInt(getName('Classement')) || undefined,
          status: FencerStatus.NOT_CHECKED_IN,
        });
      }
    }

    result.success = result.fencers.length > 0;
  } catch (error) {
    result.errors.push(`Erreur de parsing XML: ${error}`);
  }

  return result;
}
