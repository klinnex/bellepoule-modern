/**
 * BellePoule Modern - Synchronisation des scores et pistes distants (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { FencerStatus, MatchStatus } from '../../shared/types';
import type { Pool } from '../../shared/types';
import type { Arena } from '../../shared/types/remote';
import { logger, LogCategory } from '@shared/services/logger';
import { NotificationService } from '../../shared/services/notificationService';
import { propagateWinners, isBracketComplete } from '../components/tableau/tableauTypes';
import type { ConsolationBracket, TableauMatch } from '../components/tableau/tableauTypes';
import type { useFencerManagement } from './useFencerManagement';
import type { usePoolManagement } from './usePoolManagement';

interface UseRemoteScoreSyncParams {
  competitionId: string;
  competitionTitle: string;
  isRemoteActive: boolean;
  tableauMatchesRef: MutableRefObject<TableauMatch[]>;
  consolationBracketsRef: MutableRefObject<ConsolationBracket[]>;
  poolsRef: MutableRefObject<Pool[]>;
  handleFencerForfeitRef: MutableRefObject<
    ReturnType<typeof usePoolManagement>['handleFencerForfeit']
  >;
  setTableauMatches: Dispatch<SetStateAction<TableauMatch[]>>;
  setConsolationBrackets: Dispatch<SetStateAction<ConsolationBracket[]>>;
  setArenaStates: Dispatch<SetStateAction<Arena[]>>;
  updateMatchFromRemote: ReturnType<typeof usePoolManagement>['updateMatchFromRemote'];
  handleBlackCardCancelled: ReturnType<typeof usePoolManagement>['handleBlackCardCancelled'];
  updateFencer: ReturnType<typeof useFencerManagement>['updateFencer'];
}

/** Applique les scores / cartons / états de pistes remontés par le serveur de saisie distante. */
export function useRemoteScoreSync({
  competitionId,
  competitionTitle,
  isRemoteActive,
  tableauMatchesRef,
  consolationBracketsRef,
  poolsRef,
  handleFencerForfeitRef,
  setTableauMatches,
  setConsolationBrackets,
  setArenaStates,
  updateMatchFromRemote,
  handleBlackCardCancelled,
  updateFencer,
}: UseRemoteScoreSyncParams) {
  // Appliquer un score distant au bon conteneur : tableau DE, consolante, ou poule.
  // Évite le warning "Match non trouvé" côté poule pour les matchs du tableau.
  const applyRemoteScore = useCallback(
    (
      matchIdRaw: string,
      scoreARaw: number,
      scoreBRaw: number,
      finished: boolean,
      winnerOverride?: 'A' | 'B'
    ) => {
      const matchId = matchIdRaw;
      // Le score peut arriver sous forme d'objet Score ({ value }) ou de chaîne
      // selon le chemin (IPC tablette, sync DB). On normalise en nombre, sinon les
      // comparaisons scoreA > scoreB échouent (NaN) → aucun vainqueur, aucune
      // propagation au tour suivant.
      const toNum = (s: unknown): number =>
        typeof s === 'object' && s !== null
          ? Number((s as { value?: number }).value ?? 0)
          : Number(s ?? 0);
      const scoreA = toNum(scoreARaw);
      const scoreB = toNum(scoreBRaw);
      const status = finished ? MatchStatus.FINISHED : MatchStatus.IN_PROGRESS;
      // Le vainqueur transmis par le serveur (winnerOverride) fait foi : il gère les
      // cas d'égalité (tirage au sort) et reste correct même si le score transporté
      // est ambigu. On retombe sur la comparaison des scores en dernier recours.
      const resolveWinner = (match: TableauMatch) =>
        !finished
          ? (match.winner ?? null)
          : winnerOverride === 'A'
            ? match.fencerA
            : winnerOverride === 'B'
              ? match.fencerB
              : scoreA > scoreB
                ? match.fencerA
                : scoreB > scoreA
                  ? match.fencerB
                  : null;

      // La tablette/serveur peut renvoyer l'ID brut du match ('16-0') ou l'ID
      // composite stocké en base ('${competitionId}-16-0'). On apparie les deux
      // sens pour ne pas rater un match du tableau (sinon : pas de propagation).
      const idMatches = (m: { id: string }) =>
        m.id === matchId ||
        matchId === `${competitionId}-${m.id}` ||
        `${competitionId}-${matchId}` === m.id;

      const inTableau = tableauMatchesRef.current.some(idMatches);
      const inConsolation = consolationBracketsRef.current.some(b => b.matches.some(idMatches));

      // DIAGNOSTIC (visible en prod, niveau WARN) : tracer le routage du score distant.
      logger.warn(
        LogCategory.UI,
        `[applyRemoteScore] match=${matchId} score=${scoreA}-${scoreB} fini=${finished} ` +
          `→ tableau=${inTableau} consolante=${inConsolation} | ` +
          `ids tableau=[${tableauMatchesRef.current.map(m => m.id).join(',')}]`
      );

      // Un match déjà gagné ne doit pas être écrasé par une fin distante sans vainqueur
      // déterminable (ex. piste qui renvoie un match déjà saisi dans l'appli, score 0-0) :
      // sinon le vainqueur est effacé et les résultats finaux ne s'affichent plus (#909).
      const isStaleFinish = (match: TableauMatch) =>
        finished && !!match.winner && !resolveWinner(match);

      if (inTableau) {
        setTableauMatches(prev => {
          const idx = prev.findIndex(idMatches);
          if (idx === -1) return prev;
          if (isStaleFinish(prev[idx])) return prev;
          const updated = prev.map((m, i) =>
            i === idx
              ? {
                  ...m,
                  scoreA,
                  scoreB,
                  winner: resolveWinner(m),
                  specialStatus: finished ? null : m.specialStatus,
                }
              : m
          );
          if (finished) {
            const size = prev.length > 0 ? Math.max(...prev.map(m => m.round)) : 0;
            propagateWinners(updated, size);
          }
          return [...updated];
        });
      }

      if (inConsolation) {
        setConsolationBrackets(prev =>
          prev.map(bracket => {
            const idx = bracket.matches.findIndex(idMatches);
            if (idx === -1) return bracket;
            if (isStaleFinish(bracket.matches[idx])) return bracket;
            const updated = bracket.matches.map((m, i) =>
              i === idx
                ? {
                    ...m,
                    scoreA,
                    scoreB,
                    winner: resolveWinner(m),
                    specialStatus: finished ? null : m.specialStatus,
                  }
                : m
            );
            if (finished) {
              const size = updated.length > 0 ? Math.max(...updated.map(m => m.round)) : 0;
              propagateWinners(updated, size);
            }
            return { ...bracket, matches: updated, isComplete: isBracketComplete(updated) };
          })
        );
      }

      // Match de poule uniquement s'il n'est pas dans le tableau/consolante
      if (!inTableau && !inConsolation) {
        logger.warn(
          LogCategory.UI,
          `[applyRemoteScore] match=${matchId} routé vers POULES (non trouvé en tableau/consolante)`
        );
        updateMatchFromRemote(matchId, scoreA, scoreB, status, winnerOverride);
      }
    },
    [updateMatchFromRemote, competitionId]
  );

  // Charger les arènes quand le serveur distant devient actif et s'abonner aux updates
  useEffect(() => {
    if (!isRemoteActive || !competitionId || !window.electronAPI?.remote) return;
    window.electronAPI.remote
      .getArenas(competitionId)
      .then((res: any) => {
        if (res?.success && res.arenas) setArenaStates(res.arenas);
      })
      .catch(() => {});
    let unlisten: (() => void) | undefined;
    if (window.electronAPI.onRemoteArenaUpdate) {
      unlisten = window.electronAPI.onRemoteArenaUpdate(data => {
        setArenaStates(prev => {
          const idx = prev.findIndex((a: Arena) => a.id === data.arenaId);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            currentMatch: data.update?.match ?? updated[idx].currentMatch,
            status: data.update?.status ?? updated[idx].status,
          };
          return updated;
        });

        // NB : on ne propage PAS le score touche-par-touche vers les données du
        // match (poule/tableau). Le score n'est appliqué que lorsque l'arbitre
        // valide « match terminé » (event match:finished). Ici on ne met à jour
        // que l'affichage live de la piste (arenaStates, ci-dessus).
      });
    }
    return () => unlisten?.();
  }, [isRemoteActive, competitionId]);

  const fireWebhookNotif = useCallback((title: string, body: string) => {
    try {
      const webhookUrl = localStorage.getItem('bellepoule-webhook-url');
      if (!webhookUrl) return;
      const svc = new NotificationService({
        browser: false,
        webhook: { url: webhookUrl },
        events: {
          matchCompleted: true,
          matchStarting: false,
          competitionStarted: false,
          competitionEnded: false,
          fencerLate: false,
        },
      });
      svc.notify({ title, body }).catch(() => {});
    } catch {
      /* non bloquant */
    }
  }, []);

  // Écouter les mises à jour des matches distants
  // Note: pas de garde sur currentPhase car la phase 'remote' affiche le panel de saisie distante
  // mais les mises à jour doivent quand même être appliquées aux pools
  useEffect(() => {
    if (!window.electronAPI?.onRemoteMatchFinished) return;

    const handleMatchFinished = (data: {
      matchId: string;
      scoreA: number;
      scoreB: number;
      winner?: 'A' | 'B';
      isTableau?: boolean;
    }) => {
      const { matchId, scoreA, scoreB, winner: winnerOverride, isTableau } = data;
      logger.warn(
        LogCategory.UI,
        `[CompetitionView] match:finished REÇU matchId=${matchId} score=${scoreA}-${scoreB} tableau=${!!isTableau}`
      );
      applyRemoteScore(matchId, scoreA, scoreB, true, winnerOverride);
      fireWebhookNotif(
        `Match terminé — ${competitionTitle}`,
        `Score : ${scoreA} – ${scoreB}${isTableau ? ' (tableau)' : ''}`
      );
    };

    const offMatchFinished = window.electronAPI.onRemoteMatchFinished(handleMatchFinished);

    // Carton noir distant : exclure le combattant fautif dans le store
    const offExcluded = window.electronAPI.onRemoteFencerExcluded?.(({ fencerId, reason }) => {
      logger.debug(LogCategory.UI, `[CompetitionView] Combattant exclu (carton noir): ${fencerId}`);
      updateFencer(fencerId, {
        status: FencerStatus.EXCLUDED,
        exclusionReason: reason ?? 'black_card',
      });
      // Poules : matchs restants marqués non disputés et résultats de l'exclu retirés
      // du classement des adversaires, comme une exclusion saisie localement (#1011)
      if (poolsRef.current.some(p => p.fencers.some(f => f.id === fencerId))) {
        void handleFencerForfeitRef.current(fencerId, 'exclusion');
      }
    });

    // Carton noir annulé depuis la tablette : réintégrer le combattant et rouvrir le match
    const offReinstated = window.electronAPI.onRemoteFencerReinstated?.(
      ({ fencerId, matchId, status, scoreA, scoreB }) => {
        logger.debug(LogCategory.UI, `[CompetitionView] Carton noir annulé: ${fencerId}`);
        const restored = status as FencerStatus;
        handleBlackCardCancelled(fencerId, matchId, restored, scoreA, scoreB);
        updateFencer(fencerId, { status: restored, exclusionReason: null });
      }
    );

    return () => {
      offMatchFinished?.();
      offExcluded?.();
      offReinstated?.();
    };
  }, [
    applyRemoteScore,
    updateFencer,
    handleBlackCardCancelled,
    fireWebhookNotif,
    competitionTitle,
  ]);

  return { fireWebhookNotif };
}
