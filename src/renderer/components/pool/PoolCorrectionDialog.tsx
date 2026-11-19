/**
 * BellePoule Modern - Correction d'un résultat de poule après le tirage du tableau (#1996)
 * Mesure d'impact (classement, têtes de série, qualifiés, matchs joués) avant application.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { TriangleAlert, CircleCheck } from 'lucide-react';
import type { Fencer, Match } from '../../../shared/types';
import type { PoolCorrectionImpact } from '../../../shared/utils/poolCorrectionImpact';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { useTranslation } from '../../hooks/useTranslation';

/** Lignes de classement affichées avant repli (« … et N autres ») */
const MAX_RANK_ROWS = 10;

const shortName = (f: Fencer | null | undefined): string =>
  f ? `${f.lastName} ${f.firstName ? `${f.firstName.charAt(0)}.` : ''}`.trim() : '—';

const scoreText = (v: number | null | undefined, victory: boolean | undefined): string =>
  `${victory ? 'V' : ''}${v ?? '–'}`;

/** Écarts entre le tableau tiré et le classement corrigé (fenêtre et bandeau du tableau) */
export const TableauDriftList: React.FC<{
  impact: PoolCorrectionImpact;
  /** Têtes de série affichées avant repli (« … et N autres ») */
  maxSeeds?: number;
}> = ({ impact, maxSeeds }) => {
  const { t } = useTranslation();
  const seeds = maxSeeds ? impact.seedChanges.slice(0, maxSeeds) : impact.seedChanges;
  const hidden = impact.seedChanges.length - seeds.length;
  return (
    <ul>
      {seeds.map(s => (
        <li key={s.fencer.id}>
          {t('poolCorrection.seed_change', {
            name: shortName(s.fencer),
            from: s.drawn,
            to: s.corrected,
          })}
        </li>
      ))}
      {hidden > 0 && <li>{t('poolCorrection.more', { count: hidden })}</li>}
      {impact.entering.length > 0 && (
        <li>
          {t('poolCorrection.entering', { names: impact.entering.map(shortName).join(', ') })}
        </li>
      )}
      {impact.leaving.length > 0 && (
        <li>{t('poolCorrection.leaving', { names: impact.leaving.map(shortName).join(', ') })}</li>
      )}
    </ul>
  );
};

export interface PoolCorrectionDialogProps {
  /** Score corrigé ; absent : tableau refait après des corrections déjà appliquées */
  correction?: {
    poolNumber: number;
    match: Match;
    /** Score proposé, dans l'ordre fencerA / fencerB du match */
    next: { scoreA: number; scoreB: number; winner: 'A' | 'B' | null };
  };
  impact: PoolCorrectionImpact;
  onCancel: () => void;
  onKeepTableau: () => void;
  onRebuildTableau: () => void;
}

export const PoolCorrectionDialog: React.FC<PoolCorrectionDialogProps> = ({
  correction,
  impact,
  onCancel,
  onKeepTableau,
  onRebuildTableau,
}) => {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const word = t('poolCorrection.rebuild_word');
  const needsWord = impact.playedMatches > 0;
  const canRebuild = !needsWord || typed.trim().toUpperCase() === word.toUpperCase();
  const shownRanks = impact.rankChanges.slice(0, MAX_RANK_ROWS);
  const hiddenRanks = impact.rankChanges.length - shownRanks.length;

  const scoreLine = (() => {
    if (!correction) return null;
    const { match, next } = correction;
    const before = `${scoreText(match.scoreA?.value, match.scoreA?.isVictory)} – ${scoreText(
      match.scoreB?.value,
      match.scoreB?.isVictory
    )}`;
    const after = `${scoreText(next.scoreA, next.winner === 'A')} – ${scoreText(
      next.scoreB,
      next.winner === 'B'
    )}`;
    return (
      <div className="pool-correction-match">
        <span className="pool-correction-pool">
          {t('poolCorrection.pool_n', { n: correction.poolNumber })}
        </span>
        <span>
          {shortName(match.fencerA)} <strong>{before}</strong> {shortName(match.fencerB)}
        </span>
        <span className="pool-correction-arrow">→</span>
        <strong className="pool-correction-new">{after}</strong>
      </div>
    );
  })();

  return (
    <Modal
      title={t(correction ? 'poolCorrection.title' : 'poolCorrection.rebuild_title')}
      onClose={onCancel}
      size="md"
      scroll
      closeOnOverlay={false}
      footer={
        <div className="pool-correction-footer">
          <Button onClick={onCancel}>{t('poolCorrection.cancel')}</Button>
          {impact.tableauOutdated && (
            <Button
              variant="danger"
              onClick={onRebuildTableau}
              disabled={!canRebuild}
              data-testid="pool-correction-rebuild"
            >
              {t(correction ? 'poolCorrection.rebuild' : 'poolCorrection.rebuild_only')}
            </Button>
          )}
          {correction && (
            <Button variant="primary" onClick={onKeepTableau} data-testid="pool-correction-keep">
              {t(impact.tableauOutdated ? 'poolCorrection.keep' : 'poolCorrection.keep_ok')}
            </Button>
          )}
        </div>
      }
    >
      <p className="pool-correction-intro">
        {t(correction ? 'poolCorrection.intro' : 'poolCorrection.rebuild_intro')}
      </p>

      {scoreLine}

      {correction && <h4 className="pool-correction-h">{t('poolCorrection.ranking_title')}</h4>}
      {!correction ? null : shownRanks.length === 0 ? (
        <p className="pool-correction-none">{t('poolCorrection.ranking_none')}</p>
      ) : (
        <table className="pool-correction-table">
          <thead>
            <tr>
              <th>{t('poolCorrection.col_fencer')}</th>
              <th>{t('poolCorrection.col_before')}</th>
              <th>{t('poolCorrection.col_after')}</th>
            </tr>
          </thead>
          <tbody>
            {shownRanks.map(c => (
              <tr key={c.fencer.id}>
                <td>{shortName(c.fencer)}</td>
                <td>{c.from}</td>
                <td className={c.to < c.from ? 'is-up' : 'is-down'}>{c.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hiddenRanks > 0 && (
        <p className="pool-correction-none">{t('poolCorrection.more', { count: hiddenRanks })}</p>
      )}

      <h4 className="pool-correction-h">{t('poolCorrection.tableau_title')}</h4>
      {!impact.tableauOutdated ? (
        <p className="pool-correction-ok">
          <Icon icon={CircleCheck} /> {t('poolCorrection.tableau_ok')}
        </p>
      ) : (
        <div className="pool-correction-warn" role="alert">
          <p>
            <Icon icon={TriangleAlert} /> <strong>{t('poolCorrection.tableau_outdated')}</strong>
          </p>
          <TableauDriftList impact={impact} />
          {correction && <p>{t('poolCorrection.choice')}</p>}
        </div>
      )}
      {impact.playedMatches > 0 && (
        <p className="pool-correction-played">
          {t('poolCorrection.played', { count: impact.playedMatches })}
        </p>
      )}
      {impact.tableauOutdated && needsWord && (
        <label className="pool-correction-word">
          {t('poolCorrection.rebuild_warning', { count: impact.playedMatches, word })}
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={word}
            aria-label={t('poolCorrection.rebuild_word_aria')}
          />
        </label>
      )}
    </Modal>
  );
};
