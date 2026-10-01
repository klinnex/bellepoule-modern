/**
 * BellePoule Modern - TableauSignaturesModal
 * Consultation des signatures des combattants d'un match terminé du tableau
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState } from 'react';
import { TableauMatch } from './tableauTypes';

interface TableauSignaturesModalProps {
  match: TableauMatch;
  onClose: () => void;
}

const SIG_IMG_STYLE: React.CSSProperties = {
  width: '100%',
  maxHeight: '140px',
  objectFit: 'contain',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
};

const TableauSignaturesModal: React.FC<TableauSignaturesModalProps> = ({ match, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [sigs, setSigs] = useState<{ A?: string; B?: string }>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const rows = (await window.electronAPI?.db?.getDEMatchSignaturesByMatchIds?.([match.id])) ?? [];
        const out: { A?: string; B?: string } = {};
        for (const row of rows) {
          if (row.fencerId === match.fencerA?.id) out.A = row.signatureData;
          else if (row.fencerId === match.fencerB?.id) out.B = row.signatureData;
        }
        if (!cancelled) setSigs(out);
      } catch {
        /* signatures optionnelles */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [match.id, match.fencerA?.id, match.fencerB?.id]);

  const renderFencer = (slot: 'A' | 'B') => {
    const fencer = slot === 'A' ? match.fencerA : match.fencerB;
    const score = slot === 'A' ? match.scoreA : match.scoreB;
    const data = sigs[slot];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
          {fencer ? `${fencer.lastName} ${fencer.firstName}` : '—'}
          {score !== null && <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>({score})</span>}
        </div>
        {data ? (
          <img src={data} alt={`Signature ${fencer?.lastName ?? ''}`} style={SIG_IMG_STYLE} />
        ) : (
          <div style={{ color: '#9ca3af', fontSize: '0.8rem', fontStyle: 'italic' }}>
            {loading ? 'Chargement…' : 'Non signé'}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h3 className="modal-title">Signatures du match</h3>
          <button className="btn-close" onClick={onClose} aria-label="Fermer">&times;</button>
        </div>
        <div className="modal-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {renderFencer('A')}
          {renderFencer('B')}
        </div>
      </div>
    </div>
  );
};

export default TableauSignaturesModal;
