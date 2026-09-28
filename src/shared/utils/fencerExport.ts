/**
 * BellePoule Modern - Export des tireurs aux formats TXT et FFF
 * Licensed under GPL-3.0
 */

import { Fencer, Gender } from '../types';

/**
 * Formate une date au format DD/MM/YYYY pour l'export FFF
 */
function formatDateFFF(date?: Date): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Neutralise les séparateurs FFF (, et ;) dans un champ libre
 */
function fffField(value?: string): string {
  return (value || '').replace(/\s*[,;\r\n]+\s*/g, ' ').trim();
}

/**
 * Convertit le genre interne vers le format FFF (M/F)
 */
function genderToFFF(gender: Gender): string {
  switch (gender) {
    case Gender.MALE:
      return 'M';
    case Gender.FEMALE:
      return 'F';
    default:
      return '';
  }
}

/**
 * Exporte la liste des tireurs au format FFF (FFE - Federation Francaise d'Escrime)
 * Format standard FFF: NOM,Prénom,Naissance,Sexe,Nationalité;,,;Licence,Ligue,Club,Classement,?,?;Position,t
 */
export function exportFencersToFFF(fencers: Fencer[]): string {
  const lines: string[] = [];

  // En-tete standard FFF (fichier écrit en UTF-8)
  lines.push('FFF;UTF8;competition;;individuel');

  let position = 1;
  for (const fencer of fencers) {
    // Section 0: NOM,Prénom,Naissance,Sexe,Nationalité (séparés par virgule)
    const section0 = [
      fffField(fencer.lastName).toUpperCase(),
      fffField(fencer.firstName),
      formatDateFFF(fencer.birthDate),
      genderToFFF(fencer.gender),
      fffField(fencer.nationality) || 'FRA',
    ].join(',');

    // Section 1: Vide (,,)
    const section1 = ',,';

    // Section 2: Licence,Ligue,Club,Classement,Nationalité?,?
    const section2 = [
      fffField(fencer.license),
      fffField(fencer.region),
      fffField(fencer.club),
      fencer.ranking != null ? String(fencer.ranking) : '',
      '', // Nationalité (doublon)
      '', // ?
    ].join(',');

    // Section 3: Position,Statut
    const section3 = `${position},t`;

    // Assembler les sections séparées par ;
    lines.push(`${section0};${section1};${section2};${section3}`);
    position++;
  }

  return lines.join('\n');
}

/**
 * Exporte la liste des tireurs au format TXT (texte lisible)
 * Format tabulaire avec colonnes alignees
 */
export function exportFencersToTXT(fencers: Fencer[], title?: string): string {
  const lines: string[] = [];

  // Titre
  if (title) {
    lines.push(title);
    lines.push('='.repeat(title.length));
    lines.push('');
  }

  lines.push(`Nombre de tireurs : ${fencers.length}`);
  lines.push('');

  if (fencers.length === 0) {
    lines.push('Aucun tireur.');
    return lines.join('\n');
  }

  // En-tete du tableau
  const header = [
    padRight('N\u00b0', 5),
    padRight('Nom', 20),
    padRight('Pr\u00e9nom', 15),
    padRight('Sexe', 6),
    padRight('N\u00e9(e)', 12),
    padRight('Nation', 7),
    padRight('Club', 25),
    padRight('Licence', 12),
    padRight('Classement', 10),
  ].join(' ');

  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const fencer of fencers) {
    const birthYear = fencer.birthDate
      ? (fencer.birthDate instanceof Date ? fencer.birthDate : new Date(fencer.birthDate))
          .getFullYear()
          .toString()
      : '-';

    const line = [
      padRight(String(fencer.ref), 5),
      padRight(fencer.lastName.toUpperCase(), 20),
      padRight(fencer.firstName, 15),
      padRight(genderToFFF(fencer.gender) || '-', 6),
      padRight(birthYear, 12),
      padRight(fencer.nationality || '-', 7),
      padRight(fencer.club || '-', 25),
      padRight(fencer.license || '-', 12),
      padRight(fencer.ranking != null ? `#${fencer.ranking}` : '-', 10),
    ].join(' ');

    lines.push(line);
  }

  lines.push('');
  lines.push(`--- Fin de la liste (${fencers.length} tireurs) ---`);

  return lines.join('\n');
}

function padRight(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len);
  return str + ' '.repeat(len - str.length);
}
