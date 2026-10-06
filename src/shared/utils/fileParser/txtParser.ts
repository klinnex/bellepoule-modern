/**
 * BellePoule Modern - File Parser - Format TXT simple
 * Licensed under GPL-3.0
 */

import { Fencer, FencerStatus, Gender } from '../../types';
import { logger, LogCategory } from '../../services/logger';
import { ImportResult } from './common';

/**
 * Parse un fichier texte simple (format flexible)
 */
export function parseSimpleTXTFile(content: string): ImportResult {
  const result: ImportResult = {
    success: false,
    fencers: [],
    errors: [],
    warnings: [],
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

  logger.debug(LogCategory.BUSINESS, 'Parsing TXT file', { lines: lines.length });

  // Pour chaque ligne, essayer de parser un tireur
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Ignorer les lignes qui semblent être des en-têtes
    if (
      i === 0 &&
      (line.toLowerCase().includes('nom') ||
        line.toLowerCase().includes('name') ||
        line.toLowerCase().includes('prénom') ||
        line.toLowerCase().includes('prenom') ||
        line.toLowerCase().includes('sexe') ||
        line.toLowerCase().includes('sex') ||
        line.toLowerCase().includes('club') ||
        line.toLowerCase().includes('ligue'))
    ) {
      logger.debug(LogCategory.BUSINESS, 'Skipping header line', { line });
      continue;
    }

    try {
      const fencer = parseTXTLine(line, i + 1);
      if (fencer) {
        result.fencers.push(fencer);
      }
    } catch (error) {
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

  result.success = result.fencers.length > 0;

  if (result.fencers.length === 0) {
    result.warnings.push('Aucun tireur trouvé dans le fichier. Vérifiez le format.');
  }

  logger.debug(LogCategory.BUSINESS, 'Parsed TXT file', { fencers: result.fencers.length });
  return result;
}

/**
 * Parse une ligne de fichier TXT simple
 */
function parseTXTLine(line: string, lineNumber: number): Partial<Fencer> | null {
  // Essayer différents séparateurs
  const separators = [';', ',', '\t', '|', ' '];
  let bestParts: string[] = [];
  let bestScore = -1;

  for (const sep of separators) {
    const parts = line
      .split(sep)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // Évaluer la qualité du parsing
    let score = 0;

    // Plus on a de parties, mieux c'est (jusqu'à 10)
    score += Math.min(parts.length, 10);

    // Bonus si on a au moins un nom et un prénom
    if (parts.length >= 2) {
      score += 5;
    }

    // Bonus si les noms ont l'air corrects (lettres seulement)
    let nameCount = 0;
    for (let i = 0; i < Math.min(3, parts.length); i++) {
      if (/^[a-zA-ZÀ-ÿ\s\-]+$/.test(parts[i])) {
        nameCount++;
      }
    }
    score += nameCount * 2;

    // Pénalité si trop de parties vides
    const emptyCount = parts.filter(p => !p).length;
    score -= emptyCount * 3;

    if (score > bestScore) {
      bestScore = score;
      bestParts = parts;
    }
  }

  if (bestParts.length < 2) {
    logger.warn(LogCategory.BUSINESS, `Line ${lineNumber}: Not enough parts to extract name`, {
      parts: bestParts.length,
    });
    return null;
  }

  // Sauter le premier champ s'il est purement numérique (colonne N° du format TXT BellePoule)
  if (/^\d+$/.test(bestParts[0]) && bestParts.length >= 3) {
    bestParts = bestParts.slice(1);
  }

  const lastName = bestParts[0]?.toUpperCase().trim();
  const firstName = bestParts[1]?.trim();

  if (!lastName || !firstName) {
    logger.warn(LogCategory.BUSINESS, `Line ${lineNumber}: Missing name or first name`);
    return null;
  }

  // Extraire les autres informations si disponibles
  let gender = Gender.MIXED;
  const nationality = '';
  const club = '';
  let birthDate: Date | undefined;
  let ranking: number | undefined;

  // Essayer de détecter le sexe
  for (let i = 2; i < bestParts.length; i++) {
    const part = bestParts[i].toLowerCase();
    if (['m', 'h', 'homme', 'male', 'masculin'].includes(part)) {
      gender = Gender.MALE;
      break;
    } else if (['f', 'femme', 'female', 'féminin'].includes(part)) {
      gender = Gender.FEMALE;
      break;
    }
  }

  // Créer l'objet Fencer avec les informations disponibles
  const fencer: Partial<Fencer> = {
    lastName,
    firstName,
    gender,
    nationality: nationality || 'FRA', // Default France if not specified
    club: club || undefined,
    birthDate,
    ranking,
    status: FencerStatus.NOT_CHECKED_IN,
  };

  logger.debug(LogCategory.BUSINESS, 'Parsed fencer', { firstName, lastName, gender });

  return fencer;
}
