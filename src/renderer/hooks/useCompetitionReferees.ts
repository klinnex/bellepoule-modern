/**
 * BellePoule Modern - Assignation des arbitres aux matchs de poule / tableau (extrait de
 * CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { MatchStatus } from '../../shared/types';
import type { Match, Pool, Referee } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { poolMatchesWithReferee, propagatePoolReferee } from '../../shared/utils/refereeStats';
import type { ConsolationBracket, TableauMatch } from '../../shared/domain/tableau/tableauTypes';
import type { AssignmentsInput } from './usePoolsLaunch';

interface UseCompetitionRefereesParams {
  competitionId: string;
  pools: Pool[];
  setPools: Dispatch<SetStateAction<Pool[]>>;
  referees: Referee[];
  setReferees: Dispatch<SetStateAction<Referee[]>>;
  tableauMatches: TableauMatch[];
  setTableauMatches: Dispatch<SetStateAction<TableauMatch[]>>;
  consolationBrackets: ConsolationBracket[];
  setConsolationBrackets: Dispatch<SetStateAction<ConsolationBracket[]>>;
  tableMaxScore: number;
  /** Arbitres écrits par le moteur (assignMatches, docs/adr/0017) ; absent : écran seul */
  assign?: (input: AssignmentsInput) => Promise<'recorded' | 'local' | 'refused'>;
}

/** Assignation d'arbitres : remplissage auto, arbitre de poule, changements depuis les tablettes. */
export function useCompetitionReferees({
  competitionId,
  pools,
  setPools,
  referees,
  setReferees,
  tableauMatches,
  setTableauMatches,
  consolationBrackets,
  setConsolationBrackets,
  tableMaxScore,
  assign,
}: UseCompetitionRefereesParams) {
  // Applique des assignations d'arbitres (matchId → arbitre) aux matchs de poule
  const applyPoolRefereeAssignments = useCallback(
    (assignments: Map<string, Referee>) => {
      setPools(prev =>
        prev.map(pool => ({
          ...pool,
          matches: (pool.matches ?? []).map(m => {
            const ref = assignments.get(m.id);
            return ref !== undefined ? { ...m, referee: ref } : m;
          }),
        }))
      );
    },
    [setPools]
  );

  // Remplissage automatique des poules : assignation persistée en DB
  const handlePoolAutoFillReferees = useCallback(
    async (assignments: Map<string, Referee>) => {
      // Par le moteur (assignMatches) ; repli local hors moteur
      const outcome = assign
        ? await assign({
            matches: [...assignments].map(([matchId, ref]) => ({ matchId, refereeId: ref.id })),
          })
        : 'local';
      if (outcome !== 'local') return;
      applyPoolRefereeAssignments(assignments);
      for (const [matchId, ref] of assignments) {
        // updateMatch lève une erreur synchrone si l'ID n'est pas un UUID
        Promise.resolve()
          .then(() => window.electronAPI.db.updateMatch(matchId, { refereeId: ref.id }))
          .catch((e: unknown) =>
            logger.warn(
              LogCategory.DATABASE,
              'updateMatch (arbitre auto) failed',
              e instanceof Error ? e : undefined
            )
          );
      }
    },
    [applyPoolRefereeAssignments, assign]
  );

  // Arbitre(s) assigné(s) à une poule entière : l'arbitre principal est répercuté
  // sur les matchs de la poule (onglet Assignations + statistiques) (#977)
  const handlePoolRefereeAssigned = useCallback(
    async (poolId: string, poolReferees: Referee[]) => {
      const pool = pools.find(p => p.id === poolId);
      if (!pool) return;
      // Par le moteur : arbitres de la poule, principal propagé aux matchs ; l'écran relit
      const outcome = assign
        ? await assign({ pools: [{ poolId, refereeIds: poolReferees.map(r => r.id) }] })
        : 'local';
      if (outcome !== 'local') return;
      const { matches, changes } = propagatePoolReferee(
        pool.matches ?? [],
        pool.referees?.[0]?.id,
        poolReferees[0]
      );
      setPools(prev =>
        prev.map(p => (p.id === poolId ? { ...p, referees: poolReferees, matches } : p))
      );
      for (const { matchId, refereeId } of changes) {
        Promise.resolve()
          .then(() => window.electronAPI.db.updateMatch(matchId, { refereeId }))
          .catch((e: unknown) =>
            logger.warn(
              LogCategory.DATABASE,
              'updateMatch (arbitre de poule) failed',
              e instanceof Error ? e : undefined
            )
          );
      }
    },
    [pools, setPools, assign]
  );

  // Arbitre changé depuis une tablette : répercuté sur poules, tableau et consolantes (#977)
  const refereesRef = useRef(referees);
  refereesRef.current = referees;
  useEffect(() => {
    const off = window.electronAPI?.onRemoteRefereeChanged?.(async ({ matchId, refereeId }) => {
      let ref = refereesRef.current.find(r => r.id === refereeId);
      if (!ref) {
        const rows: Referee[] = await window.electronAPI.db
          .getRefereesByCompetition(competitionId)
          .catch(() => []);
        setReferees(rows);
        ref = rows.find(r => r.id === refereeId);
      }
      if (!ref) return;
      const principal = ref;
      const withReferee = <T extends { id: string; referees?: Array<{ id: string }> }>(m: T): T =>
        m.id !== matchId
          ? m
          : {
              ...m,
              referee: principal,
              ...(m.referees?.length ? { referees: [principal, ...m.referees.slice(1)] } : {}),
            };
      applyPoolRefereeAssignments(new Map([[matchId, principal]]));
      setTableauMatches(prev => prev.map(withReferee));
      setConsolationBrackets(prev =>
        prev.map(b =>
          b.matches.some(m => m.id === matchId) ? { ...b, matches: b.matches.map(withReferee) } : b
        )
      );
    });
    return () => off?.();
  }, [competitionId, applyPoolRefereeAssignments]);

  // Matchs proposés à l'assignation d'arbitres : poules + tableau + consolation
  const refereeAssignableMatches = useMemo<Match[]>(() => {
    const now = new Date();
    const toMatch = (m: TableauMatch, tableId: string): Match => ({
      id: m.id,
      number: m.position,
      fencerA: m.fencerA,
      fencerB: m.fencerB,
      scoreA: null,
      scoreB: null,
      maxScore: tableMaxScore === 0 ? 999 : tableMaxScore,
      status: m.winner || m.isBye ? MatchStatus.FINISHED : MatchStatus.NOT_STARTED,
      referee: m.referee ? referees.find(r => r.id === m.referee!.id) : undefined,
      tableId,
      round: m.round,
      position: m.position,
      createdAt: now,
      updatedAt: now,
    });
    return [
      ...pools.flatMap(poolMatchesWithReferee),
      ...tableauMatches.map(m => toMatch(m, competitionId)),
      ...consolationBrackets.flatMap(b => b.matches.map(m => toMatch(m, b.id))),
    ];
  }, [pools, tableauMatches, consolationBrackets, referees, tableMaxScore, competitionId]);

  return {
    applyPoolRefereeAssignments,
    handlePoolAutoFillReferees,
    handlePoolRefereeAssigned,
    refereeAssignableMatches,
  };
}
