/**
 * BellePoule Modern - Consultation des signatures d'une poule (#1826)
 * Lecture seule : nom des tireurs et signature enregistrée sur la tablette.
 * L'édition se fait uniquement sur la feuille de poule distante, verrouillée une fois tout signé.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { useTranslation } from '../../hooks/useTranslation';
import type { Fencer } from '../../../shared/types';

interface PoolSignaturesModalProps {
  poolId: string;
  poolNumber: number;
  fencers: Fencer[];
  onClose: () => void;
}

export const PoolSignaturesModal: React.FC<PoolSignaturesModalProps> = ({
  poolId,
  poolNumber,
  fencers,
  onClose,
}) => {
  const { t } = useTranslation();
  const [signatures, setSignatures] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let alive = true;
    window.electronAPI?.db
      ?.getPoolSignatures?.(poolId)
      .then(sigs => {
        if (alive) setSignatures(new Map(sigs.map(s => [s.fencerId, s.signatureData])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [poolId]);

  return (
    <Modal title={t('poolView.signatures_title', { n: poolNumber })} onClose={onClose} scroll>
      <table className="table pool-signatures-table">
        <tbody>
          {fencers.map(f => {
            const sig = signatures.get(f.id);
            return (
              <tr key={f.id}>
                <td>
                  <strong>{f.lastName}</strong> {f.firstName}
                </td>
                <td>
                  {sig ? (
                    <img
                      className="pool-signature-img"
                      src={sig}
                      alt={`${f.lastName} ${f.firstName}`}
                    />
                  ) : (
                    <span className="text-muted">{t('poolView.not_signed')}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
};

export default PoolSignaturesModal;
