/**
 * BellePoule Modern - Génération du tableau, saisie des scores, remplissage automatique et annulation de match
 * Licensed under GPL-3.0
 */

import { useEffect } from 'react';
import { Fencer, FencerStatus, PoolRanking } from '../../../shared/types';
export {
  TableauMatch,
  ConsolationBracket,
  propagateWinners,
} from '../../components/tableau/tableauTypes';
import {
  TableauMatch,
  propagateWinners,
  deriveFirstRound,
  isBracketComplete,
  TableauSpecialStatus,
  resetTableauMatch,
  resolveMatchWinner,
  tieScoreError,
  tieVictoryOf,
} from '../../components/tableau/tableauTypes';
// pdfExport (jsPDF) chargé à la demande ; seule la constante reste en import statique léger
import {
  getTableauSize,
  buildTableauMatches,
  autoFillTableauScores,
  autoFillAllPositions,
  placeBarrageWinners,
  syncConsolationBrackets,
  calculateFinalResults,
  isTableauDone,
  buildCombinedResults,
} from '../../components/tableau/tableauCalculations';
import { autoAssignReferees } from '../../../shared/utils/refereeStats';
import { simulateMatchEvents } from '../../../shared/utils/simulatedMatchEvents';
import { persistSimulatedEvents } from '../../services/simulatedEventsPersistence';
import { TableauViewProps } from '../../components/tableau/tableauViewShared';
import { useTableauViewState } from './useTableauViewState';

type Ctx = TableauViewProps & ReturnType<typeof useTableauViewState>;

/** Génération du tableau, saisie des scores, remplissage automatique et annulation de match (extrait de TableauViewComponent, #1599) */
export function useTableauViewScoring(ctx: Ctx) {
  const {
    readOnly,
    matches,
    setTableauSize,
    ranking,
    thirdPlaceMatch,
    maxScore,
    mountMatchesRef,
    onComplete,
    playAllPositions,
    tableauSize,
    consolationBrackets,
    setConsolationBrackets,
    onMatchesChange,
    confirm,
    t,
    isUnlimitedScore,
    autoFillReferees,
    onMatchRefereeChange,
    showToast,
    setShowScoreModal,
    setEditingMatch,
    setEditingConsolationId,
    setEditScoreA,
    setEditScoreB,
    setVictoryA,
    setVictoryB,
    editingMatch,
    editScoreA,
    editScoreB,
    victoryA,
    victoryB,
    tieBreakByVictory,
    editingConsolationId,
    undo,
    competitionId,
    weapon,
  } = ctx;

  useEffect(() => {
    if (readOnly) {
      // En lecture seule, ne pas régénérer le tableau, mais déduire sa taille
      // des matches existants pour permettre l'affichage des rounds.
      if (matches.length > 0) {
        // deriveFirstRound écarte le round de barrage (mainSize*2) : sinon la taille
        // serait surévaluée à mainSize*2 et l'affichage des tours serait faussé.
        setTableauSize(deriveFirstRound(matches));
      }
      return;
    }
    const eligibleCount = ranking.filter(
      r =>
        r.fencer.status !== FencerStatus.ABANDONED &&
        r.fencer.status !== FencerStatus.FORFAIT &&
        r.fencer.status !== FencerStatus.EXCLUDED &&
        r.fencer.status !== FencerStatus.ELIMINATED
    ).length;
    if (eligibleCount > 0) {
      const expectedSize = getMainTableauSize(eligibleCount);
      // deriveFirstRound écarte le round de barrage (mainSize*2) et la petite finale.
      // Avec un Math.max naïf, un tableau avec barrages restauré (tab switch) donnait
      // currentSize = mainSize*2 ≠ expectedSize → regénération qui effaçait les scores saisis.
      const currentSize = matches.length > 0 ? deriveFirstRound(matches) : 0;

      const hasThirdPlace = matches.some(m => m.round === 3);
      const thirdPlaceMismatch = thirdPlaceMatch !== hasThirdPlace;

      if (matches.length === 0 || currentSize !== expectedSize || thirdPlaceMismatch) {
        generateTableau();
      } else {
        setTableauSize(currentSize);
      }
    }
  }, [readOnly, ranking.length, thirdPlaceMatch, maxScore, matches.length]); // Dépend du nombre de tireurs, match pour la 3ème place et score max

  // Filet de sécurité : détecte la complétion du tableau à chaque mise à jour de matches
  // Couvre les chemins qui ne passent pas par handleScoreSubmit (saisie distante, statuts spéciaux)
  useEffect(() => {
    if (readOnly) return;
    // Ignorer si matches n'a pas changé depuis le montage du composant.
    // Robuste au double-invoke de React StrictMode : le ref de montage reste stable
    // entre les deux passes, contrairement à un booléen consommé au premier run.
    if (matches === mountMatchesRef.current) return;
    if (matches.length === 0 || !onComplete) return;
    const champion = matches.find(m => m.round === 2)?.winner;
    if (!champion) return;
    const thirdPlaceEntry = matches.find(m => m.round === 3);
    const thirdPlaceDone = !thirdPlaceEntry || !!thirdPlaceEntry.winner;
    if (thirdPlaceDone && !playAllPositions) {
      onComplete(calculateFinalResults(matches, ranking, tableauSize));
    }
    // calculateFinalResults et onComplete sont stables pendant la phase tableau
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, readOnly]);

  // NB : la synchronisation tablette → tableau (event match:finished) est gérée
  // de façon centralisée par applyRemoteScore dans CompetitionView, qui fonctionne
  // quel que soit l'onglet affiché. On ne s'abonne PLUS ici pour éviter une double
  // mise à jour concurrente qui écrasait le vainqueur (course value vs functional).
  // La complétion du tableau est détectée par le filet de sécurité ci-dessus.

  // playAllPositions : déclencher onComplete quand le tableau principal ET tous les brackets de consolation sont terminés
  useEffect(() => {
    if (readOnly || !playAllPositions || !onComplete || matches.length === 0) return;
    // NB : pas de garde « matches === mountMatchesRef » ici. La dernière saisie qui
    // complète le classement est souvent un match de bracket de consolation, qui ne
    // modifie PAS `matches`. Après un changement d'onglet (remontage), `matches` est
    // identique au montage : la garde bloquait alors onComplete et l'étape tableau ne
    // se validait jamais. Le cas « déjà complet restauré depuis DB » est couvert par
    // le garde readOnly (finalResults.length > 0 ⇒ readOnly) en amont.
    const mainFinalDone = !!matches.find(m => m.round === 2)?.winner;
    const mainThirdEntry = matches.find(m => m.round === 3);
    const mainThirdDone = !mainThirdEntry || !!mainThirdEntry.winner;
    if (!mainFinalDone || !mainThirdDone) return;
    // Des brackets de consolation sont attendus quand tableauSize >= 8 (rounds > 4)
    // ou quand il y a des barrages. Pour tableauSize <= 4, aucun bracket de consolation
    // n'est créé (les demi-finalistes perdants vont directement à la petite finale).
    const hasBarrages = matches.some(m => m.round === tableauSize * 2);
    const needsConsolation = tableauSize >= 8 || hasBarrages;
    if (needsConsolation && consolationBrackets.length === 0) return; // pas encore créés
    if (consolationBrackets.some(b => !b.isComplete)) return;
    onComplete(buildCombinedResults(matches, consolationBrackets, ranking));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, consolationBrackets, playAllPositions]);

  // Mode playAllPositions : créer les brackets de consolation quand un round du tableau principal se complète
  useEffect(() => {
    if (!playAllPositions || matches.length === 0) return;
    setConsolationBrackets(
      prevBrackets => syncConsolationBrackets(matches, prevBrackets, tableauSize, ranking).brackets
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, tableauSize, playAllPositions]);

  // Gagnants des barrages → placer dans le tableau principal
  useEffect(() => {
    if (!playAllPositions || tableauSize === 0) return;
    const updatedMatches = matches.map(m => ({ ...m }));
    if (placeBarrageWinners(updatedMatches, tableauSize)) onMatchesChange(updatedMatches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    matches
      .filter(m => m.round === tableauSize * 2)
      .map(m => m.winner?.id)
      .join(','),
    tableauSize,
  ]);

  // Pour playAllPositions : plus grande puissance de 2 ≤ fencerCount
  const getMainTableauSize = (fencerCount: number): number => {
    if (!playAllPositions) return getTableauSize(fencerCount);
    const sizes = [4, 8, 16, 32, 64, 128, 256];
    let result = 4;
    for (const size of sizes) {
      if (size <= fencerCount) result = size;
    }
    return result;
  };

  const getEligibleFencers = (): PoolRanking[] =>
    ranking.filter(
      r =>
        r.fencer.status !== FencerStatus.ABANDONED &&
        r.fencer.status !== FencerStatus.FORFAIT &&
        r.fencer.status !== FencerStatus.EXCLUDED &&
        r.fencer.status !== FencerStatus.ELIMINATED
    );

  const generateTableau = () => {
    const qualifiedFencers = getEligibleFencers().sort((a, b) => a.rank - b.rank);
    const mainSize = getMainTableauSize(qualifiedFencers.length);

    setTableauSize(mainSize);
    setConsolationBrackets([]); // réinitialiser les brackets de consolation

    // Barrages éventuels + premier tour + rounds suivants + petite finale + propagation des byes
    const newMatches = buildTableauMatches(
      qualifiedFencers,
      mainSize,
      playAllPositions,
      thirdPlaceMatch
    );
    onMatchesChange(newMatches);
  };

  const handleAutoFillScores = async () => {
    if (readOnly) return;
    // window.confirm natif casse le focus clavier sous Electron/Windows
    const confirmed = await confirm(t('poolView.autofill_confirm'));

    if (!confirmed) return;

    const effectiveMax = isUnlimitedScore ? 15 : maxScore;

    // Matchs déjà terminés avant le remplissage : leur arbitre n'est pas modifié
    const alreadyDone = new Set(
      [...matches, ...consolationBrackets.flatMap(b => b.matches)]
        .filter(m => m.winner)
        .map(m => m.id)
    );
    // Charge partagée entre tableau principal et consolantes
    const refereeLoad = new Map<string, number>();
    for (const m of [...matches, ...consolationBrackets.flatMap(b => b.matches)]) {
      if (m.referee) refereeLoad.set(m.referee.id, (refereeLoad.get(m.referee.id) ?? 0) + 1);
    }
    // Assigne un arbitre aux matchs remplis sans arbitre (statistiques de test)
    const withAutoReferees = (list: TableauMatch[]): TableauMatch[] => {
      if (!autoFillReferees?.length) return list;
      const targets = list.filter(
        m => m.winner && !m.isBye && m.fencerA && m.fencerB && !m.referee && !alreadyDone.has(m.id)
      );
      const assignments = autoAssignReferees(targets, autoFillReferees, refereeLoad);
      if (assignments.size === 0) return list;
      return list.map(m => {
        const r = assignments.get(m.id);
        if (!r) return m;
        const principal = { id: r.id, firstName: r.firstName, lastName: r.lastName };
        onMatchRefereeChange?.(m.id, r.id);
        return { ...m, referee: principal, referees: [principal] };
      });
    };

    // Durée, touches par zone (Sabre Laser) et cartons simulés des matchs remplis (tableau principal,
    // id DB composite) : alimentent l'analytique
    const persistSimulated = (list: TableauMatch[]) => {
      if (!competitionId) return;
      const entries = list
        .filter(
          m =>
            m.winner &&
            !m.isBye &&
            m.fencerA &&
            m.fencerB &&
            m.scoreA != null &&
            m.scoreB != null &&
            !alreadyDone.has(m.id)
        )
        .map(m => {
          const dbId = `${competitionId}-${m.id}`;
          return {
            matchId: dbId,
            events: simulateMatchEvents({
              matchId: dbId,
              fencerAId: m.fencerA!.id,
              fencerBId: m.fencerB!.id,
              scoreA: m.scoreA!,
              scoreB: m.scoreB!,
              weapon,
            }),
          };
        });
      void persistSimulatedEvents(entries);
    };

    // Toutes les places : barrages + tableau principal + tous les brackets de consolation.
    // La complétion est détectée par l'effet playAllPositions (matches + brackets).
    if (playAllPositions) {
      const { updatedMatches, updatedBrackets, filledCount } = autoFillAllPositions(
        matches,
        consolationBrackets,
        effectiveMax,
        tableauSize,
        ranking
      );
      setConsolationBrackets(
        updatedBrackets.map(b => ({ ...b, matches: withAutoReferees(b.matches) }))
      );
      onMatchesChange(withAutoReferees(updatedMatches));
      persistSimulated(updatedMatches);
      showToast(t('plural.scores_generated', { count: filledCount }), 'success');
      return;
    }

    const filled = autoFillTableauScores(matches, effectiveMax, tableauSize);
    const updatedMatches = withAutoReferees(filled.updatedMatches);
    const { filledCount } = filled;

    // Créer une copie profonde pour forcer React à re-renderer
    const matchesCopy = updatedMatches.map(m => ({ ...m }));
    onMatchesChange(matchesCopy);
    persistSimulated(updatedMatches);
    showToast(t('plural.scores_generated', { count: filledCount }), 'success');

    // Vérifier si le tableau est complet
    if (isTableauDone(updatedMatches) && onComplete) {
      const finalResults = calculateFinalResults(updatedMatches, ranking, tableauSize);
      onComplete(finalResults);
    }
  };

  // Met à jour les matchs d'un bracket de consolation
  const updateConsolationMatch = (
    consolationId: string,
    matchId: string,
    scoreA: number,
    scoreB: number,
    winner: Fencer | null,
    specialStatus: TableauSpecialStatus | null = null
  ) => {
    setConsolationBrackets(prev =>
      prev.map(bracket => {
        if (bracket.id !== consolationId) return bracket;
        const updatedMatches = bracket.matches.map(m => {
          if (m.id === matchId) return { ...m, scoreA, scoreB, winner, specialStatus };
          return m;
        });
        propagateWinners(updatedMatches, bracket.size);
        const isComplete = isBracketComplete(updatedMatches);
        return { ...bracket, matches: updatedMatches.map(m => ({ ...m })), isComplete };
      })
    );
  };

  // Ferme la modale de score et remet le formulaire à zéro
  const closeScoreModal = () => {
    setShowScoreModal(false);
    setEditingMatch(null);
    setEditingConsolationId(null);
    setEditScoreA('');
    setEditScoreB('');
    setVictoryA(false);
    setVictoryB(false);
  };

  const handleScoreSubmit = () => {
    if (!editingMatch) return;

    const scoreA = parseInt(editScoreA) || 0;
    const scoreB = parseInt(editScoreB) || 0;

    // Validation : pas d'égalité hors Sabre Laser ; en Laser, l'égalité exige un vainqueur (V ou tirage)
    const tieError = tieScoreError(scoreA, scoreB, victoryA || victoryB, tieBreakByVictory);
    if (tieError) return showToast(t(tieError), 'error');

    if (!isUnlimitedScore && maxScore > 0) {
      if (scoreA > maxScore || scoreB > maxScore) {
        showToast(t('tableauView.max_score', { max: maxScore }), 'error');
        return;
      }
    }

    // Si c'est un match de bracket de consolation
    if (editingConsolationId) {
      const bracket = consolationBrackets.find(b => b.id === editingConsolationId);
      if (bracket) {
        const match = bracket.matches.find(m => m.id === editingMatch);
        const winner = resolveMatchWinner(match, scoreA, scoreB, victoryA, victoryB);
        updateConsolationMatch(editingConsolationId, editingMatch, scoreA, scoreB, winner);
      }
      closeScoreModal();
      return;
    }

    undo.record(matches);
    const editedMatch = matches.find(m => m.id === editingMatch);
    const winner = resolveMatchWinner(editedMatch, scoreA, scoreB, victoryA, victoryB);

    const updatedMatches = matches.map(match => {
      if (match.id === editingMatch) {
        return {
          ...match,
          scoreA,
          scoreB,
          winner,
          specialStatus: null,
        };
      }
      return match;
    });

    // Propager les gagnants avant de sauvegarder
    propagateWinners(updatedMatches, tableauSize);

    // Créer une copie profonde pour forcer React à re-renderer
    const matchesCopy = updatedMatches.map(m => ({ ...m }));
    onMatchesChange(matchesCopy);

    // Vérifier si le tableau est complet (finale + petite finale si elle existe)
    if (isTableauDone(updatedMatches) && onComplete && !playAllPositions) {
      const finalResults = calculateFinalResults(updatedMatches, ranking, tableauSize);
      onComplete(finalResults);
    }

    closeScoreModal();
  };

  // Annulation d'un match (#1115) : score effacé, vainqueur retiré du tour suivant
  const handleMatchCancel = () => {
    if (!editingMatch) return;
    if (editingConsolationId) {
      const bracket = consolationBrackets.find(b => b.id === editingConsolationId);
      const reset = bracket ? resetTableauMatch(bracket.matches, editingMatch) : null;
      if (!bracket || !reset) {
        showToast(t('tableauView.next_played'), 'error');
        return;
      }
      setConsolationBrackets(prev =>
        prev.map(b =>
          b.id === editingConsolationId
            ? { ...b, matches: reset, isComplete: isBracketComplete(reset) }
            : b
        )
      );
    } else {
      const reset = resetTableauMatch(matches, editingMatch);
      if (!reset) {
        showToast(t('tableauView.next_played'), 'error');
        return;
      }
      undo.record(matches);
      onMatchesChange(reset);
    }
    closeScoreModal();
  };

  const openScoreModal = (match: TableauMatch, consolationId?: string) => {
    setEditingMatch(match.id);
    setEditingConsolationId(consolationId ?? null);
    setEditScoreA(match.scoreA?.toString() || '');
    setEditScoreB(match.scoreB?.toString() || '');
    const tie = tieVictoryOf(match);
    setVictoryA(tie.a);
    setVictoryB(tie.b);
    setShowScoreModal(true);
  };

  return {
    handleAutoFillScores,
    updateConsolationMatch,
    closeScoreModal,
    handleScoreSubmit,
    handleMatchCancel,
    openScoreModal,
  };
}
