/**
 * BellePoule Modern - File Parser - Classements FFE (import de classement)
 * Licensed under GPL-3.0
 */

import { Fencer } from '../../types';
import { logger, LogCategory } from '../../services/logger';

/**
 * Parse un fichier de classement FFE
 */
export function parseRankingFile(content: string): Map<string, number> {
  const rankings = new Map<string, number>();

  const lines = content.split(/\r?\n/).filter(line => line.trim());

  for (const line of lines) {
    // Format: RANG;NOM;PRENOM;... ou NOM;PRENOM;RANG
    const parts = line.split(/[;,\t]/).map(p => p.trim());

    // Chercher un numéro de classement
    for (let i = 0; i < parts.length; i++) {
      const rank = parseInt(parts[i]);
      if (!isNaN(rank) && rank > 0 && rank < 10000) {
        // Le nom est probablement avant ou après
        const nameIndex = i === 0 ? 1 : 0;
        if (parts[nameIndex]) {
          const key = parts[nameIndex].toUpperCase();
          rankings.set(key, rank);
        }
        break;
      }
    }
  }

  return rankings;
}

/**
 * Importe un classement depuis un fichier FFF
 * Met à jour UNIQUEMENT les tireurs présents dans la liste d'appel existante
 *
 * Format attendu:
 * - FFF standard: NOM,Prénom,Naissance,Sexe,Nationalité;?,?,?;Licence,Ligue,Club,Classement,?
 * - Format simple: NOM;PRENOM;...;CLASSEMENT
 *
 * @param content Contenu du fichier FFF
 * @param existingFencers Liste des tireurs existants (liste d'appel)
 * @returns Résultat de l'import avec statistiques
 */
export interface RankingImportResult {
  updated: number;
  notFound: number;
  notInFile: number;
  skipped: number;
  totalLines: number;
  totalFencers: number;
  errors: string[];
  details: Array<{
    lastName: string;
    firstName: string;
    club?: string;
    ranking: number;
    matched: boolean;
    fencerId?: string;
  }>;
}

export function importRankingFromFFF(
  content: string,
  existingFencers: Fencer[]
): RankingImportResult {
  const result: RankingImportResult = {
    updated: 0,
    notFound: 0,
    notInFile: 0,
    skipped: 0,
    totalLines: 0,
    totalFencers: existingFencers.length,
    errors: [],
    details: [],
  };

  // Nettoyer le contenu
  let cleanContent = content;
  if (cleanContent.charCodeAt(0) === 0xfeff) {
    cleanContent = cleanContent.slice(1);
  }
  cleanContent = cleanContent.replace(/^\uFFFE/, '').replace(/^\uFEFF/, '');

  const lines = cleanContent.split(/\r?\n/).filter(line => line.trim());

  if (lines.length === 0) {
    result.errors.push('Le fichier est vide');
    return result;
  }

  result.totalLines = lines.length;

  // CSV à en-têtes (NOM, PRENOM, CLASSEMENT [, LICENCE, CLUB]) : colonnes dans n'importe quel ordre (#1025)
  const headerMap = parseRankingHeader(lines[0]);
  if (headerMap) {
    importRankingWithHeader(lines, headerMap, existingFencers, result);
    return result;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      result.skipped++;
      continue;
    }

    // Ignorer les lignes d'en-tête
    if (
      i === 0 &&
      (line.toLowerCase().includes('nom') ||
        line.toLowerCase().includes('classement') ||
        line.toLowerCase().includes('fff') ||
        line.toLowerCase().includes('utf'))
    ) {
      result.skipped++;
      continue;
    }

    try {
      const rankingInfo = parseRankingLineFFF(line, i + 1);
      if (!rankingInfo) {
        result.skipped++;
        continue;
      }

      // Vérifier que le nom est valide (doit contenir des lettres, pas juste des dates ou chiffres)
      if (
        !rankingInfo.lastName ||
        rankingInfo.lastName.length < 2 ||
        /^\d+$/.test(rankingInfo.lastName)
      ) {
        result.skipped++;
        continue;
      }

      // Chercher le tireur correspondant dans la liste existante
      const matchedFencer = findMatchingFencer(rankingInfo, existingFencers);

      if (matchedFencer) {
        // Mettre à jour le classement
        matchedFencer.ranking = rankingInfo.ranking;
        matchedFencer.updatedAt = new Date();
        result.updated++;
      } else {
        result.notFound++;
      }

      result.details.push({
        lastName: rankingInfo.lastName,
        firstName: rankingInfo.firstName,
        club: rankingInfo.club,
        ranking: rankingInfo.ranking,
        matched: !!matchedFencer,
        fencerId: matchedFencer?.id,
      });
    } catch (error) {
      result.skipped++;
      logger.error(
        LogCategory.BUSINESS,
        `Error parsing line ${i + 1}`,
        error instanceof Error ? error : undefined,
        { line }
      );
      result.errors.push(
        `Ligne ${i + 1}: ${error instanceof Error ? error.message : 'Erreur de parsing'}`
      );
    }
  }

  // Compter les tireurs de l'appel qui n'ont pas de classement dans le fichier
  const updatedFencerIds = new Set(result.details.filter(d => d.matched).map(d => d.fencerId));
  result.notInFile = existingFencers.filter(f => !updatedFencerIds.has(f.id)).length;

  return result;
}

/**
 * Parse une ligne FFF pour extraire nom, prénom, club et classement
 */
interface RankingInfo {
  lastName: string;
  firstName: string;
  club?: string;
  ranking: number;
}

function parseRankingLineFFF(line: string, lineNumber: number): RankingInfo | null {
  // Essayer différents formats FFF

  // Format 1: FFF standard avec sections (NOM,Prénom,...;...;Licence,Ligue,Club,Classement,Nationalité?;Position,Statut)
  if (line.includes(';')) {
    const mainParts = line.split(';').map(p => p.trim());

    // Supprimer les parties vides à la fin
    while (mainParts.length > 0 && mainParts[mainParts.length - 1] === '') {
      mainParts.pop();
    }

    // Section 0: NOM,Prénom,Naissance,Sexe,Nationalité
    if (mainParts[0] && mainParts[0].includes(',')) {
      const personalInfo = mainParts[0].split(',').map(p => p.trim());
      const lastName = personalInfo[0] || '';
      const firstName = personalInfo[1] || '';

      // Section 2: Licence,Ligue,Club,Classement,Nationalité?,?
      if (mainParts.length >= 3) {
        const clubInfo = mainParts[2].split(',').map(p => p.trim());
        const club = clubInfo[2] || undefined;

        let ranking: number | undefined;

        // Format classement FFF avec position finale dans la dernière section
        // Exemple: ...;2,t où 2 est la position finale
        if (mainParts.length >= 4) {
          // La dernière section contient la position finale et le statut
          const lastSection = mainParts[mainParts.length - 1].split(',').map(p => p.trim());
          // Le premier élément est la position finale
          if (lastSection.length >= 1 && lastSection[0]) {
            const posRanking = parseInt(lastSection[0]);
            if (!isNaN(posRanking) && posRanking > 0) {
              ranking = posRanking;
            }
          }
        }

        // Fallback: si pas de position finale trouvée, chercher dans clubInfo (ancien format)
        if (ranking === undefined) {
          for (let i = clubInfo.length - 1; i >= 0; i--) {
            const val = clubInfo[i];
            if (val && val !== '?' && !isNaN(parseInt(val))) {
              const parsed = parseInt(val);
              if (parsed > 0) {
                ranking = parsed;
                break;
              }
            }
          }
        }

        if (lastName && ranking !== undefined) {
          return { lastName, firstName, club, ranking };
        }
      }
    }

    // Format alternatif: NOM;PRENOM;...;CLASSEMENT
    // Vérifier que la première section contient bien un nom (au moins 2 lettres)
    if (mainParts.length >= 2) {
      const potentialLastName = mainParts[0];
      const potentialFirstName = mainParts[1];

      // Vérifier que ça ressemble à des noms (pas des dates ou des codes)
      if (
        potentialLastName.length >= 2 &&
        /[A-Za-zÀ-ÿ]/.test(potentialLastName) &&
        !/^\d{2}\/\d{2}\/\d{4}/.test(potentialLastName)
      ) {
        const lastName = potentialLastName;
        const firstName = potentialFirstName;

        // Chercher le classement (dernier champ numérique)
        for (let i = mainParts.length - 1; i >= 0; i--) {
          const ranking = parseInt(mainParts[i]);
          if (!isNaN(ranking) && ranking > 0 && ranking < 10000) {
            return { lastName, firstName, ranking };
          }
        }
      }
    }
  }

  // Format 2: Tout séparé par virgules
  if (line.includes(',')) {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      const lastName = parts[0];
      const firstName = parts[1];

      // Chercher le classement dans les champs suivants
      for (let i = 2; i < parts.length; i++) {
        const ranking = parseInt(parts[i]);
        if (!isNaN(ranking) && ranking > 0 && ranking < 10000) {
          return { lastName, firstName, ranking };
        }
      }
    }
  }

  return null;
}

/**
 * Trouve un tireur correspondant dans la liste existante
 * Utilise une logique de matching fuzzy sur le nom et le club
 */
function findMatchingFencer(rankingInfo: RankingInfo, existingFencers: Fencer[]): Fencer | null {
  const searchLastName = normalizeName(rankingInfo.lastName);
  const searchFirstName = normalizeName(rankingInfo.firstName);
  const searchClub = rankingInfo.club ? normalizeName(rankingInfo.club) : undefined;

  let bestMatch: Fencer | null = null;
  let bestScore = 0;

  for (const fencer of existingFencers) {
    const fencerLastName = normalizeName(fencer.lastName);
    const fencerFirstName = normalizeName(fencer.firstName);
    const fencerClub = fencer.club ? normalizeName(fencer.club) : undefined;

    // Score de matching
    let score = 0;

    // Nom exact
    if (fencerLastName === searchLastName) {
      score += 10;
    } else if (fencerLastName.includes(searchLastName) || searchLastName.includes(fencerLastName)) {
      score += 5;
    }

    // Prénom exact ou partiel
    if (fencerFirstName === searchFirstName) {
      score += 8;
    } else if (
      fencerFirstName.includes(searchFirstName) ||
      searchFirstName.includes(fencerFirstName)
    ) {
      score += 4;
    }

    // Club (bonus)
    if (searchClub && fencerClub) {
      if (fencerClub === searchClub) {
        score += 3;
      } else if (fencerClub.includes(searchClub) || searchClub.includes(fencerClub)) {
        score += 1;
      }
    }

    // Minimum de score pour considérer comme match (baissé pour être plus permissif)
    if (score >= 12 && score > bestScore) {
      bestScore = score;
      bestMatch = fencer;
    }
  }

  return bestMatch;
}

/**
 * Normalise un nom pour la comparaison
 */
function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .replace(/\s+/g, ' ')
    .trim();
}

/** Colonnes repérées dans l'en-tête d'un CSV de classement */
interface RankingHeader {
  separator: string;
  lastName: number;
  firstName: number;
  ranking: number;
  license?: number;
  club?: number;
}

const HEADER_ALIASES: Record<'lastName' | 'firstName' | 'ranking' | 'license' | 'club', string[]> =
  {
    lastName: ['NOM', 'NOM DE FAMILLE', 'LASTNAME', 'LAST NAME'],
    firstName: ['PRENOM', 'FIRSTNAME', 'FIRST NAME'],
    ranking: ['CLASSEMENT', 'CLASST', 'RANG', 'RANK', 'RANKING', 'PLACE'],
    license: ['LICENCE', 'LICENSE', 'N LICENCE', 'NUMERO LICENCE', 'NO LICENCE', 'LICENCE FFE'],
    club: ['CLUB'],
  };

const normalizeHeader = (cell: string): string =>
  normalizeName(cell.replace(/^"|"$/g, ''))
    .replace(/[°º.#_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Détecte un en-tête de CSV de classement contenant au minimum NOM, PRENOM et CLASSEMENT.
 * Retourne null si la première ligne n'est pas un tel en-tête.
 */
export function parseRankingHeader(line: string): RankingHeader | null {
  const separator = [';', '\t', ','].find(sep => line.includes(sep));
  if (!separator) return null;
  const cells = line.split(separator).map(normalizeHeader);
  const find = (key: keyof typeof HEADER_ALIASES): number | undefined => {
    const idx = cells.findIndex(c => HEADER_ALIASES[key].includes(c));
    return idx === -1 ? undefined : idx;
  };
  const lastName = find('lastName');
  const firstName = find('firstName');
  const ranking = find('ranking');
  if (lastName === undefined || firstName === undefined || ranking === undefined) return null;
  return {
    separator,
    lastName,
    firstName,
    ranking,
    license: find('license'),
    club: find('club'),
  };
}

function importRankingWithHeader(
  lines: string[],
  header: RankingHeader,
  existingFencers: Fencer[],
  result: RankingImportResult
): void {
  result.skipped++; // ligne d'en-tête
  const cell = (parts: string[], idx: number | undefined): string =>
    idx === undefined ? '' : (parts[idx] ?? '').replace(/^"|"$/g, '').trim();

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(header.separator);
    const lastName = cell(parts, header.lastName);
    const firstName = cell(parts, header.firstName);
    const ranking = parseInt(cell(parts, header.ranking), 10);
    if (!lastName || isNaN(ranking) || ranking <= 0) {
      result.skipped++;
      continue;
    }
    const license = cell(parts, header.license);
    const club = cell(parts, header.club) || undefined;

    // Identification : licence d'abord, puis nom + prénom exacts (sans accents ni casse)
    const normLicense = license.replace(/\s+/g, '');
    const byLicense = normLicense
      ? existingFencers.find(f => f.license && f.license.replace(/\s+/g, '') === normLicense)
      : undefined;
    const matchedFencer =
      byLicense ??
      existingFencers.find(
        f =>
          normalizeName(f.lastName) === normalizeName(lastName) &&
          normalizeName(f.firstName) === normalizeName(firstName)
      );

    if (matchedFencer) {
      matchedFencer.ranking = ranking;
      matchedFencer.updatedAt = new Date();
      result.updated++;
    } else {
      result.notFound++;
    }
    result.details.push({
      lastName,
      firstName,
      club,
      ranking,
      matched: !!matchedFencer,
      fencerId: matchedFencer?.id,
    });
  }

  const updatedFencerIds = new Set(result.details.filter(d => d.matched).map(d => d.fencerId));
  result.notInFile = existingFencers.filter(f => !updatedFencerIds.has(f.id)).length;
}
