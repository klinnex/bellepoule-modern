/**
 * BellePoule Modern - File Parser - Arbitres Engarde
 * Licensed under GPL-3.0
 */

import { Gender, Referee } from '../../types';

// ============================================================================
// Import arbitres Engarde
// ============================================================================

export interface RefereeImportResult {
  referees: Array<Omit<Referee, 'id' | 'ref' | 'createdAt' | 'updatedAt' | 'status'>>;
  errors: string[];
  skipped: number;
}

/**
 * Parse un fichier arbitres au format Engarde (TXT semicolon-separated).
 * En-tête attendu: nom;prenom;sexe;categorie;club;ligue;nation;date_nais;licence_fie;licence;
 */
export function parseEngardeRefereeFile(content: string): RefereeImportResult {
  const result: RefereeImportResult = { referees: [], errors: [], skipped: 0 };

  let clean = content;
  if (clean.charCodeAt(0) === 0xfeff) clean = clean.slice(1);

  const lines = clean
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    result.errors.push('Fichier vide');
    return result;
  }

  // Détecter et sauter l'en-tête
  const firstLower = lines[0].toLowerCase();
  const startIdx =
    firstLower.includes('nom') || firstLower.includes('prenom') || firstLower.includes('sexe')
      ? 1
      : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length < 2) {
      result.skipped++;
      continue;
    }

    const lastName = parts[0]?.trim() || '';
    const firstName = parts[1]?.trim() || '';
    if (!lastName && !firstName) {
      result.skipped++;
      continue;
    }

    const sexe = parts[2]?.trim().toUpperCase();
    const gender: Gender = sexe === 'M' ? Gender.MALE : Gender.FEMALE;
    const category = parts[3]?.trim() || undefined;
    const club = parts[4]?.trim() || undefined;
    const region = parts[5]?.trim() || undefined;
    const nationality = parts[6]?.trim() || 'FRA';
    // date_nais ignoré pour les arbitres
    // licence_fie = parts[8], licence FFE = parts[9]
    const licenseFIE = parts[8]?.trim() || '';
    const licenseFFE = parts[9]?.trim() || '';
    const license = licenseFFE || licenseFIE || undefined;

    result.referees.push({
      lastName,
      firstName,
      gender,
      nationality,
      club,
      region,
      license,
      category,
    });
  }

  return result;
}
