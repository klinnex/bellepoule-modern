/**
 * BellePoule Modern - File Parser - Types et helpers partagés
 * Licensed under GPL-3.0
 */

import { Fencer, Referee } from '../../types';

/** Arbitre lu dans un fichier d'import (bloc <Arbitres> du XML, #1504) */
export type ImportedReferee = Pick<Referee, 'firstName' | 'lastName' | 'gender' | 'nationality'> &
  Partial<Pick<Referee, 'club' | 'region' | 'license' | 'category'>>;

/** Équipe lue dans un fichier fédéral : nom fourni par l'extranet, membres par clé tireur */
export interface ImportedTeam {
  name: string;
  club?: string;
  /** Clés des tireurs membres (voir fencerKey) */
  members: string[];
}

export interface ImportResult {
  success: boolean;
  fencers: Partial<Fencer>[];
  /** Équipes (XML par équipes : attribut Equipe des tireurs) ; absent en individuel */
  teams?: ImportedTeam[];
  /** Arbitres trouvés (XML avec <Arbitres>) ; absent si le fichier n'en déclare pas */
  referees?: ImportedReferee[];
  errors: string[];
  warnings: string[];
}

/** Clé de rapprochement d'un tireur entre fichiers : licence, sinon NOM|prénom */
export function fencerKey(f: { license?: string; lastName?: string; firstName?: string }): string {
  const license = f.license?.trim();
  if (license) return `L:${license.replace(/^0+(?=\d)/, '')}`;
  return `N:${(f.lastName ?? '').trim().toUpperCase()}|${(f.firstName ?? '').trim().toLowerCase()}`;
}

const XML_NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * Décode les entités XML d'une valeur d'attribut (&apos; &amp; &#201; &#xC9;…).
 * Un seul passage : « &amp;lt; » donne « &lt; », jamais « < ».
 */
export function decodeXmlEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = entity[1] === 'x' || entity[1] === 'X';
      const code = hex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return XML_NAMED_ENTITIES[entity] ?? match;
  });
}

/** Lecteur d'attributs d'une balise ouvrante (valeurs décodées) */
export function attrReader(tag: string): (attr: string) => string {
  return attr => {
    const m = tag.match(new RegExp(`\\s${attr}="([^"]*)"`));
    return m ? decodeXmlEntities(m[1]).trim() : '';
  };
}

/** Date jj.mm.aaaa (ou jj/mm/aaaa) → Date locale à minuit ; undefined si invalide */
export function parseFrenchDate(raw: string): Date | undefined {
  const m = raw.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!m) return undefined;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(year, month - 1, day);
  return d.getMonth() === month - 1 && d.getDate() === day ? d : undefined;
}
