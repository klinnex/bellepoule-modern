/**
 * BellePoule Modern - File Parser - Types et helpers partagés
 * Licensed under GPL-3.0
 */

import { Fencer, Referee } from '../../types';

/** Arbitre lu dans un fichier d'import (bloc <Arbitres> du XML, #1504) */
export type ImportedReferee = Pick<Referee, 'firstName' | 'lastName' | 'gender' | 'nationality'> &
  Partial<Pick<Referee, 'club' | 'region' | 'license' | 'category'>>;

export interface ImportResult {
  success: boolean;
  fencers: Partial<Fencer>[];
  /** Arbitres trouvés (XML avec <Arbitres>) ; absent si le fichier n'en déclare pas */
  referees?: ImportedReferee[];
  errors: string[];
  warnings: string[];
}
