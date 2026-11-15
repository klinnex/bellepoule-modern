/**
 * BellePoule Modern - Export des tireurs aux formats TXT et FFF
 * Licensed under GPL-3.0
 */

import { Category, Competition, Fencer, FencerStatus, Gender, Weapon } from '../types';

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
 * Ligne 2 de l'en-tête FFF (compétition) : date;arme;sexe;catégorie;nom;nom réduit
 * Les lignes 1 et 2 sont communes à la liste des tireurs et aux résultats.
 */
function competitionHeaderLines(competition: Competition): string[] {
  const organizer = fffField(competition.organizer) || fffField(competition.title);
  const shortName = fffField(competition.shortTitle) || fffField(competition.title);
  return [
    `FFF;WIN;COMPETITION;${organizer}`,
    [
      formatDateFFFShort(competition.date),
      weaponToFFF(competition.weapon),
      genderToFFF(competition.gender).toLowerCase(),
      categoryToFFF(competition.category),
      fffField(competition.title),
      shortName,
    ].join(';'),
  ];
}

/** Partie 1 d'une ligne FFF : NOM,Prénom,date,sexe,nation */
function fencerGeneralPart(fencer: Fencer): string {
  return [
    fffField(fencer.lastName).toUpperCase(),
    fffField(fencer.firstName),
    formatDateFFFShort(fencer.birthDate),
    genderToFFF(fencer.gender),
    fffField(fencer.nationality) || 'FRA',
  ].join(',');
}

/**
 * Partie 3 d'une ligne FFF (fédération nationale) : licence,région,club,classement,points,département
 * N5 (points) reste vide ; le département (#1504) occupe le 6e champ, comme le lit le parseur.
 */
function fencerNationalPart(fencer: Fencer): string {
  return [
    fffField(fencer.license),
    fffField(fencer.region),
    fffField(fencer.club),
    fencer.ranking != null ? String(fencer.ranking) : '',
    '',
    fffField(fencer.department),
  ].join(',');
}

/**
 * Exporte la liste des tireurs au format FFF (spécification FFF, 3 août 2000).
 *   ligne 1 : FFF;WIN;COMPETITION;<organisateur>
 *   ligne 2 : date;arme;sexe;catégorie;nom;nom réduit
 *   lignes  : NOM,Prénom,date,sexe,nation;;<national>;<position>,
 * La partie compétition ne porte que la position dans la liste (C1) : le statut T/P
 * n'existe qu'après la compétition.
 */
export function exportFencersToFFF(competition: Competition, fencers: Fencer[]): string {
  const lines: string[] = [...competitionHeaderLines(competition)];

  fencers.forEach((fencer, index) => {
    lines.push(`${fencerGeneralPart(fencer)};;${fencerNationalPart(fencer)};${index + 1},`);
  });

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

/** Date FFF sans zéro de tête (ex. 7/6/2000), comme dans la spécification */
function formatDateFFFShort(date?: Date | string): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Arme au vocabulaire FFF (fleuret, epee, sabre) */
function weaponToFFF(weapon: Weapon): string {
  switch (weapon) {
    case Weapon.FOIL:
      return 'fleuret';
    case Weapon.EPEE:
      return 'epee';
    case Weapon.SABRE:
    case Weapon.LASER:
      return 'sabre';
    default:
      return '';
  }
}

/** Catégorie d'âge au vocabulaire FFF (approximation : à valider avec la FFE) */
function categoryToFFF(category: Category): string {
  switch (category) {
    case Category.U9:
      return 'poussin';
    case Category.U11:
      return 'benjamin';
    case Category.U13:
      return 'minime';
    case Category.U15:
    case Category.U17:
      return 'cadet';
    case Category.U20:
      return 'junior';
    case Category.SENIOR:
      return 'senior';
    default:
      return 'veteran';
  }
}

/**
 * Exporte les résultats finaux au format FFF « résultat de compétition »
 * (spécification FFF, 3 août 2000) :
 *   ligne 1 : FFF;WIN;COMPETITION;<organisateur>
 *   ligne 2 : date;arme;sexe;catégorie;nom;nom réduit
 *   lignes  : NOM,Prénom,date,sexe,nation;<FIE vide>;<national>;<rang>,<T|P>
 * Les tireurs exclus sont omis. Les tireurs sans rang (carton noir) ont un rang vide.
 * T = participation au tableau, P = éliminé dans les poules.
 */
export function exportResultsToFFF(
  competition: Competition,
  results: Array<{ rank?: number | null; fencer: Fencer; eliminatedAt?: string }>
): string {
  const lines: string[] = [...competitionHeaderLines(competition)];

  const sorted = results
    .filter(r => r.fencer.status !== FencerStatus.EXCLUDED)
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));

  for (const { rank, fencer, eliminatedAt } of sorted) {
    // Partie 2 (FIE) : non fournie par BellePoule, vide
    // Partie 4 : rang final et statut (T = tableau, P = poules)
    const status = eliminatedAt?.startsWith('Poules') ? 'P' : 'T';
    lines.push(
      `${fencerGeneralPart(fencer)};;${fencerNationalPart(fencer)};${rank != null ? rank : ''},${status}`
    );
  }

  return lines.join('\n');
}

/**
 * Encode un texte FFF en Windows-1252 (charset annoncé par « FFF;WIN »).
 * Les caractères absents de cp1252 sont remplacés par « ? ».
 */
export function encodeFFFWin1252(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) {
      bytes.push(code);
    } else {
      const idx = CP1252_HIGH.indexOf(ch);
      bytes.push(idx >= 0 ? 0x80 + idx : 0x3f);
    }
  }
  return new Uint8Array(bytes);
}

/** Caractères cp1252 de 0x80 à 0x9F (les autres sont identiques à Latin-1) */
const CP1252_HIGH =
  '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f' +
  '\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178';
