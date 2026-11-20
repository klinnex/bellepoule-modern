/**
 * BellePoule Modern - Tournoi des rapières : props des vues génériques (#1441)
 * Appel (colonnes Équipe / Tireurs / Catégorie / Niveau) et préparation des poules
 * (séparation club + regroupement par niveau, nom d'équipe et bulle de niveau).
 * Licensed under GPL-3.0
 */

import { useMemo } from 'react';
import { Fencer } from '../../shared/types';
import { RAPIERES_LEVELS, RapieresTeamInfo } from './rapieres.types';
import { rapieresTeamCategory } from './rapieresAge';
import { waveMatchOrder } from './rapieresCalculations';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function useRapieresViewProps(teams: Record<string, RapieresTeamInfo>, t: Translate) {
  return useMemo(() => {
    const levelLabel = (f: Fencer) => {
      const info = teams[f.id];
      return info ? t(`rapieres.level_${info.level}`) : '';
    };
    return {
      /** Appel : Niveau = niveau d'équipe, Né(e) → catégorie d'équipe (moyenne d'âge) */
      appel: {
        columnLabels: {
          lastName: t('rapieres.team'),
          firstName: t('rapieres.fencers'),
          birthDate: t('rapieres.category'),
          club: t('rapieres.level'),
        },
        hiddenColumns: ['ranking' as const, 'nationality' as const, 'handedness' as const],
        cellValues: {
          club: levelLabel,
          birthDate: (f: Fencer) => {
            const info = teams[f.id];
            return info ? t(`rapieres.cat_${rapieresTeamCategory(info)}`) : '';
          },
        },
      },
      /** Préparation des poules : club + niveau réordonnables, niveau actif = regroupement */
      poolPrep: {
        levelRankOf: (f: Fencer) => RAPIERES_LEVELS.indexOf(teams[f.id]?.level ?? 'beginner'),
        separationKeys: ['byClub', 'byLevel'] as Array<'byClub' | 'byLevel'>,
        fencerDisplay: (f: Fencer) => {
          const level = levelLabel(f) || undefined;
          const club = teams[f.id]?.club;
          return {
            label: f.lastName,
            pill: level,
            pillTitle: [level, club].filter(Boolean).join(' — '),
          };
        },
        customMatchOrder: waveMatchOrder,
        /** Numéro de couleur = numéro de l'équipe dans la liste d'appel (#1816) */
        positionOf: (f: Fencer) => f.ref,
      },
    };
  }, [teams, t]);
}
