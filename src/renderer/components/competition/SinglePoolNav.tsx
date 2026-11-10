/**
 * BellePoule Modern - Navigation entre poules (vue « poule unique », extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { useTranslation } from '../../hooks/useTranslation';
import type { Pool } from '../../../shared/types';

interface SinglePoolNavProps {
  pools: Pool[];
  singlePoolIndex: number;
  setSinglePoolIndex: Dispatch<SetStateAction<number>>;
}

const SinglePoolNav: React.FC<SinglePoolNavProps> = ({
  pools,
  singlePoolIndex,
  setSinglePoolIndex,
}) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1.5rem',
      }}
    >
      <Button
        onClick={() => setSinglePoolIndex(i => (i - 1 + pools.length) % pools.length)}
        disabled={pools.length <= 1}
        title={t('competitionView.prev_pool')}
        aria-label={t('competitionView.prev_pool')}
      >
        <Icon icon={ChevronLeft} />
      </Button>
      <select
        className="form-input"
        style={{ width: 'auto', fontWeight: 600, textAlign: 'center' }}
        value={singlePoolIndex}
        onChange={e => setSinglePoolIndex(Number(e.target.value))}
        aria-label={t('competitionView.select_pool')}
      >
        {pools.map((pool, i) => (
          <option key={pool.id} value={i}>
            {t('competitionView.pool_n', { n: pool.number })}
          </option>
        ))}
      </select>
      <Button
        onClick={() => setSinglePoolIndex(i => (i + 1) % pools.length)}
        disabled={pools.length <= 1}
        title={t('competitionView.next_pool')}
        aria-label={t('competitionView.next_pool')}
      >
        <Icon icon={ChevronRight} />
      </Button>
    </div>
  );
};

export default React.memo(SinglePoolNav);
