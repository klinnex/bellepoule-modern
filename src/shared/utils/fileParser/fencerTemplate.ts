/**
 * BellePoule Modern - Modèle d'import de tireurs (CSV / Excel)
 * Licensed under GPL-3.0
 */

/** Colonnes reconnues par le parseur FFE (ffeParser.ts) : en-tête + ordre fixe */
export const FENCER_IMPORT_COLUMNS = [
  'NOM',
  'PRENOM',
  'SEXE',
  'DATE_NAISSANCE',
  'NATION',
  'LIGUE',
  'CLUB',
  'LICENCE',
  'CLASSEMENT',
] as const;

/** Ligne d'exemple : à supprimer avant l'import */
const EXAMPLE_ROW = [
  'DUPONT',
  'Jean',
  'M',
  '15/03/1995',
  'FRA',
  'Île-de-France',
  'Paris Escrime',
  '12345678',
  '12',
];

/**
 * Modèle CSV « ; » (UTF-8 avec BOM, fins de ligne CRLF) : Excel (réglages français)
 * l'ouvre directement en colonnes, et le même fichier enregistré en .xlsx est accepté à l'import.
 */
export function buildFencerImportTemplate(): string {
  const cell = (value: string): string =>
    /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = [FENCER_IMPORT_COLUMNS, EXAMPLE_ROW].map(row => row.map(cell).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
