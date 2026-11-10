/**
 * BellePoule Modern - Actions de la vue de poule : validation des scores, statuts spéciaux, impression, remplissage automatique
 * Licensed under GPL-3.0
 */

import { useMemo } from 'react';
import { resolveInlineSubmit } from '../../../shared/utils/inlineScoreInput';
import { MatchStatus } from '../../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { type SpecialStatus as PoolSpecialStatus } from '../../components/common/SpecialStatusPanel';
import { autoAssignReferees } from '../../../shared/utils/refereeStats';
import { specialStatusOutcome } from '../../components/pool/poolSpecialStatus';
import type { PoolViewProps } from '../../components/pool/poolViewTypes';
import { usePoolViewInput } from './usePoolViewInput';
import { usePoolViewState } from './usePoolViewState';

type Ctx = PoolViewProps &
  ReturnType<typeof usePoolViewState> &
  ReturnType<typeof usePoolViewInput>;

/** Actions de la vue de poule : validation des scores, statuts spéciaux, impression, remplissage automatique (extrait de PoolViewComponent, #1599) */
export function usePoolViewActions(ctx: Ctx) {
  const {
    inlineEditCell,
    inlineSingleScore,
    maxScore,
    pool,
    tieByVictory,
    isLaserSabre,
    cellScoreBuffer,
    getRecordedCellScore,
    tieWinnerCellsRef,
    openNextCell,
    showToast,
    t,
    openScoreModal,
    setCellScoreBuffer,
    onScoreUpdate,
    setInlineEditCell,
    setInlineSingleScore,
    editingMatch,
    editScoreA,
    editScoreB,
    isMatchInverted,
    victoryA,
    victoryB,
    addAction,
    priorityPick,
    commitTie,
    setShowTieChooser,
    setMatchesUpdateTrigger,
    closeAndResetScoreModal,
    handleScoreSubmitRef,
    setPendingSpecialStatus,
    pendingSpecialStatus,
    onFencerStatusChange,
    competitionName,
    competitionId,
    getVisibleColumns,
    pdfHideStatColumns,
    pdfLandscape,
    stripQr,
    poolTemplate,
    confirm,
    assignedReferees,
    autoFillReferees,
    onAutoFillReferees,
    onMatchReset,
  } = ctx;

  const handleInlineSubmit = () => {
    if (!inlineEditCell) return;
    const { key, rowId, colId, matchIndex, inverted } = inlineEditCell;
    const r = resolveInlineSubmit({
      raw: inlineSingleScore,
      maxScore: maxScore || pool.matches[matchIndex]?.maxScore || 0,
      tieByVictory,
      isLaserSabre,
      key,
      rowId,
      colId,
      inverted,
      buffer: cellScoreBuffer,
      recordedMirror: getRecordedCellScore(matchIndex, inverted, true), // #1046
      winnerCells: tieWinnerCellsRef.current,
    });
    if (r.action === 'skip') openNextCell(key, new Set(), cellScoreBuffer);
    else if (r.action === 'error') showToast(t(r.msgKey, { max: r.max ?? 0 }), 'error');
    else if (r.action === 'modal') openScoreModal(matchIndex, inverted);
    else if (r.action === 'buffer') {
      setCellScoreBuffer(r.buffer);
      openNextCell(key, new Set(), r.buffer);
    } else {
      setCellScoreBuffer(r.restBuffer);
      if (r.winner) onScoreUpdate(matchIndex, r.scoreA, r.scoreB, r.winner);
      else onScoreUpdate(matchIndex, r.scoreA, r.scoreB);
      openNextCell(key, new Set([key, r.mirrorKey]), r.restBuffer);
    }
  };

  const handleInlineCancel = () => {
    setInlineEditCell(null);
    setInlineSingleScore('');
  };

  const handleScoreSubmit = () => {
    if (editingMatch === null) return;

    const scoreLeft = parseInt(editScoreA, 10) || 0;
    const scoreRight = parseInt(editScoreB, 10) || 0;

    // Valider que les scores ne dépassent pas le maximum
    // Le réglage courant (prop) prime sur le maxScore figé à la génération du match
    const effectiveMax = maxScore || pool.matches[editingMatch]?.maxScore || 0;
    if (effectiveMax > 0) {
      if (scoreLeft > effectiveMax) {
        showToast(t('poolView.max_score_a', { max: effectiveMax }), 'error');
        return;
      }
      if (scoreRight > effectiveMax) {
        showToast(t('poolView.max_score_b', { max: effectiveMax }), 'error');
        return;
      }
    }

    // Remettre dans l'ordre fencerA/fencerB du match si la vue est inversée
    const actualScoreA = isMatchInverted ? scoreRight : scoreLeft;
    const actualScoreB = isMatchInverted ? scoreLeft : scoreRight;

    // Capturer l'ancien score pour l'historique
    const match = pool.matches[editingMatch];
    const prevScoreA =
      typeof match?.scoreA === 'number' ? match.scoreA : ((match?.scoreA as any)?.value ?? null);
    const prevScoreB =
      typeof match?.scoreB === 'number' ? match.scoreB : ((match?.scoreB as any)?.value ?? null);
    const matchIdx = editingMatch;

    if (actualScoreA === actualScoreB) {
      if (tieByVictory && (victoryA || victoryB)) {
        // victoryA = victoire du tireur affiché à gauche (= fencerA si normal, fencerB si inversé)
        const winnerLeft = victoryA;
        const winner: 'A' | 'B' = isMatchInverted
          ? winnerLeft
            ? 'B'
            : 'A'
          : winnerLeft
            ? 'A'
            : 'B';
        addAction({
          type: 'UPDATE_SCORE',
          description: `Score poule ${pool.number} match ${matchIdx + 1}`,
          undo: () => {
            if (prevScoreA !== null && prevScoreB !== null)
              onScoreUpdate(matchIdx, prevScoreA, prevScoreB);
          },
          redo: () => {
            onScoreUpdate(matchIdx, actualScoreA, actualScoreB, winner);
          },
        });
        onScoreUpdate(editingMatch, actualScoreA, actualScoreB, winner);
      } else if (isLaserSabre) {
        showToast(t('poolView.draw_laser'), 'warning');
        return;
      } else if (victoryA || victoryB) {
        // Tirage au sort déjà décidé (ex: résultat importé depuis une tablette arbitre)
        const winnerLeft = victoryA;
        const winner: 'A' | 'B' = isMatchInverted
          ? winnerLeft
            ? 'B'
            : 'A'
          : winnerLeft
            ? 'A'
            : 'B';
        addAction({
          type: 'UPDATE_SCORE',
          description: `Score poule ${pool.number} match ${matchIdx + 1}`,
          undo: () => {
            if (prevScoreA !== null && prevScoreB !== null)
              onScoreUpdate(matchIdx, prevScoreA, prevScoreB);
          },
          redo: () => {
            onScoreUpdate(matchIdx, actualScoreA, actualScoreB, winner);
          },
        });
        onScoreUpdate(editingMatch, actualScoreA, actualScoreB, winner);
      } else if (tieByVictory) {
        // Minute prioritaire tirée avant la minute supplémentaire : le prioritaire gagne sans touche
        if (priorityPick) {
          commitTie(actualScoreA, actualScoreB, undefined, priorityPick);
        } else {
          setShowTieChooser(true);
        }
        return;
      } else {
        showToast(t('poolView.draw_live'), 'error');
        return;
      }
    } else {
      addAction({
        type: 'UPDATE_SCORE',
        description: `Score poule ${pool.number} match ${matchIdx + 1}`,
        undo: () => {
          if (prevScoreA !== null && prevScoreB !== null)
            onScoreUpdate(matchIdx, prevScoreA, prevScoreB);
        },
        redo: () => {
          onScoreUpdate(matchIdx, actualScoreA, actualScoreB);
        },
      });
      onScoreUpdate(editingMatch, actualScoreA, actualScoreB);
    }

    // Forcer la mise à jour de l'ordre des matchs
    setMatchesUpdateTrigger(prev => prev + 1);

    // Fermer le modal immédiatement après la mise à jour
    closeAndResetScoreModal();
  };

  // Mettre à jour la ref avec la fonction actuelle
  handleScoreSubmitRef.current = handleScoreSubmit;

  // Ouvre la modale « Quel est le combattant … ? ». Les erreurs arrivent : on
  // ne déclenche rien tant que le référent n'a pas désigné un combattant.
  const handleSpecialStatus = (status: PoolSpecialStatus) => {
    if (editingMatch === null) return;
    setPendingSpecialStatus(status);
  };

  // Le référent a désigné le combattant concerné (côté affiché) dans la modale
  const applySpecialStatus = (side: 'left' | 'right', blackCard = false) => {
    const status = pendingSpecialStatus;
    if (status === null || editingMatch === null) {
      setPendingSpecialStatus(null);
      return;
    }

    const match = pool.matches[editingMatch];
    const out = specialStatusOutcome({
      side,
      inverted: isMatchInverted,
      status,
      isLaserSabre,
      editScoreLeft: editScoreA,
      editScoreRight: editScoreB,
      scoreA: match.scoreA?.value,
      scoreB: match.scoreB?.value,
      maxScore,
    });
    onScoreUpdate(editingMatch, out.scoreA, out.scoreB, out.winner, status);
    const loserFencer = out.loser === 'A' ? match.fencerA : match.fencerB;
    if (onFencerStatusChange && loserFencer) {
      onFencerStatusChange(loserFencer.id, status, blackCard);
    }

    // Forcer la mise à jour de l'ordre des matchs
    setMatchesUpdateTrigger(prev => prev + 1);

    // Fermer les modales immédiatement après la mise à jour
    setPendingSpecialStatus(null);
    closeAndResetScoreModal();
  };

  const finishedCount = useMemo(
    () => pool.matches.filter(m => m.status === MatchStatus.FINISHED).length,
    [pool.matches]
  );
  const totalMatches = pool.matches.length;

  // Options communes à l'export PDF et à l'impression de la feuille de poule
  const buildPoolPrintOptions = async () => {
    const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
    const sigsArray = await window.electronAPI.db.getPoolSignatures(pool.id);
    const signatures = Object.fromEntries(sigsArray.map(s => [s.fencerId, s.signatureData]));
    return {
      title: `Poule ${pool.number} - ${pool.fencers.length} tireurs`,
      includeFinishedMatches: true,
      includePendingMatches: true,
      includePoolStats: true,
      logoBase64: logo,
      competitionName,
      competitionId,
      visibleColumns: getVisibleColumns('pool', pool.id),
      hideStatColumns: pdfHideStatColumns,
      landscape: pdfLandscape,
      signatures,
      stripQrUrl: stripQr?.url,
      stripNumber: stripQr?.strip,
    };
  };

  const errorText = (e: unknown) => (e instanceof Error ? e.message : t('poolView.unknown_error'));

  // Impression directe de la feuille de poule (Ctrl+P / bouton 🖨️)
  const handlePrintPool = async () => {
    try {
      const options = await buildPoolPrintOptions();
      const { printPoolHTML } = await import('../../../shared/utils/pdfExport');
      await printPoolHTML(pool, options, poolTemplate);
    } catch (error) {
      logger.error(LogCategory.UI, "Erreur lors de l'impression de la poule", error as Error);
      showToast(t('poolView.print_error', { error: errorText(error) }), 'error');
    }
  };

  // Fonction pour remplir automatiquement tous les scores de la poule (pour les tests)
  const handleAutoFillScores = async () => {
    const confirmed = await confirm({
      message: t('poolView.autofill_confirm'),
      confirmLabel: t('poolView.autofill_ok'),
      cancelLabel: t('actions.cancel'),
    });

    if (!confirmed) return;

    const pendingMatches = pool.matches
      .map((match, index) => ({ match, index }))
      .filter(({ match }) => match.status !== MatchStatus.FINISHED);

    if (pendingMatches.length === 0) {
      showToast(t('poolView.all_finished'), 'info');
      return;
    }

    // Arbitres : ceux de la poule en priorité, sinon ceux de la compétition (statistiques de test)
    const refereeCandidates =
      assignedReferees.length > 0 ? assignedReferees : (autoFillReferees ?? []);
    if (onAutoFillReferees && refereeCandidates.length > 0) {
      const load = new Map<string, number>();
      for (const m of pool.matches) {
        if (m.referee) load.set(m.referee.id, (load.get(m.referee.id) ?? 0) + 1);
      }
      const assignments = autoAssignReferees(
        pendingMatches.map(({ match }) => match).filter(m => !m.referee),
        refereeCandidates,
        load
      );
      if (assignments.size > 0) onAutoFillReferees(assignments);
    }

    // Scores tirés au hasard, puis appliqués ; une seule action annulable (Ctrl+Z) (#1037)
    const generated: Array<{ index: number; a: number; b: number; winner?: 'A' | 'B' }> = [];
    for (const { index } of pendingMatches) {
      const scoreA = Math.floor(Math.random() * (maxScore + 1));
      const scoreB = Math.floor(Math.random() * (maxScore + 1));

      if (scoreA === scoreB) {
        if (isLaserSabre) {
          // En sabre laser, désigner un vainqueur aléatoire en cas d'égalité
          generated.push({ index, a: scoreA, b: scoreB, winner: Math.random() > 0.5 ? 'A' : 'B' });
        } else if (scoreA === 0) {
          // En escrime classique, éviter l'égalité
          generated.push({ index, a: 1, b: 0 });
        } else if (Math.random() > 0.5) {
          generated.push({ index, a: scoreA + 1, b: scoreB });
        } else {
          generated.push({ index, a: scoreA, b: scoreB + 1 });
        }
      } else {
        // Scores différents : désigner le vainqueur explicitement
        generated.push({ index, a: scoreA, b: scoreB, winner: scoreA > scoreB ? 'A' : 'B' });
      }
    }

    const applyGenerated = () => {
      for (const g of generated) onScoreUpdate(g.index, g.a, g.b, g.winner);
      setMatchesUpdateTrigger(prev => prev + 1);
    };
    addAction({
      type: 'UPDATE_SCORE',
      description: `Scores aléatoires poule ${pool.number} (${generated.length} matchs)`,
      undo: () => {
        for (const g of generated) onMatchReset?.(g.index);
        setMatchesUpdateTrigger(prev => prev + 1);
      },
      redo: applyGenerated,
    });
    applyGenerated();

    showToast(t('plural.scores_generated', { count: pendingMatches.length }), 'success');
  };

  return {
    handleInlineSubmit,
    handleInlineCancel,
    handleScoreSubmit,
    handleSpecialStatus,
    applySpecialStatus,
    finishedCount,
    totalMatches,
    handlePrintPool,
    handleAutoFillScores,
  };
}
