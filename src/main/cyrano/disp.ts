/**
 * BellePoule Modern - Construction d'un DISP Cyrano à partir d'un match (#1720)
 * Descripteur neutre, indépendant du stockage (poule, tableau, arène) :
 * le raccordement aux arènes le remplit puis appelle `CyranoServer.sendDisp`.
 * Licensed under GPL-3.0
 */

import type { CyranoFencer, CyranoMessage, CyranoWeapon } from './codec';
import { formatCyranoName, formatCyranoNat, type CyranoNameLength } from './names';

export interface CyranoDispFencer {
  /** Identifiant stable (jamais le nom : il peut changer) */
  id: string;
  lastName: string;
  firstName: string;
  /** Valeur du champ nation (pays, club, ligue) : réduite à 3 caractères */
  nat?: string;
  score?: number;
}

export interface CyranoDispMatch {
  /** Phase : 1er tour de poules = 1, … ; tableau = dernier tour de poules + 1 */
  phase: number;
  /** N° de poule ou identifiant de tableau (`A32`) */
  poulTab: string;
  match: number;
  /** Période (individuel) ou relais (équipes) */
  round?: number;
  /** Heure prévue (HH:MM) */
  time?: string;
  /** Arme BellePoule ('E' | 'F' | 'S' | 'L' | 'C') */
  weapon: string;
  team?: boolean;
  /** Tireur affiché à droite / à gauche */
  right: CyranoDispFencer;
  left: CyranoDispFencer;
  referee?: { id: string; name: string; nat?: string };
}

export interface CyranoDispOptions {
  nameLength?: CyranoNameLength;
}

/** Armes transmissibles : Laser et CUSTOM sont hors protocole. */
export function toCyranoWeapon(weapon: string): CyranoWeapon | undefined {
  return weapon === 'E' || weapon === 'F' || weapon === 'S' ? weapon : undefined;
}

/** Tableau de N tireurs → identifiant Cyrano (`A32`, `A8`…) ; `suite` distingue les tableaux annexes. */
export function tableauId(size: number, suite = 'A'): string {
  return `${suite}${size}`;
}

function fencer(f: CyranoDispFencer, opts: CyranoDispOptions): CyranoFencer {
  return {
    id: f.id,
    name: formatCyranoName(f.lastName, f.firstName, opts.nameLength ?? 10),
    nat: formatCyranoNat(f.nat),
    score: f.score,
    status: 'U',
  };
}

export type CyranoDisp = Omit<CyranoMessage, 'protocol' | 'command' | 'piste' | 'compe'>;

export function buildDisp(m: CyranoDispMatch, opts: CyranoDispOptions = {}): CyranoDisp {
  return {
    phase: String(m.phase),
    poulTab: m.poulTab,
    match: String(m.match),
    round: String(m.round ?? 1),
    time: m.time,
    type: m.team ? 'T' : 'I',
    weapon: toCyranoWeapon(m.weapon),
    priority: 'N',
    refId: m.referee?.id,
    refName: m.referee?.name,
    refNat: m.referee ? formatCyranoNat(m.referee.nat) : undefined,
    right: fencer(m.right, opts),
    left: fencer(m.left, opts),
  };
}

/** DISP « vide » : aucun match disponible pour l'instant. */
export const EMPTY_DISP: CyranoDisp = {};
