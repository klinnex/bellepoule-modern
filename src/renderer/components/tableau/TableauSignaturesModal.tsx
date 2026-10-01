/**
 * BellePoule Modern - TableauSignaturesModal
 * Consultation des signatures des combattants d'un match terminé du tableau
 * + renvoi de la demande de signature vers une piste si le match n'est pas signé
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TableauMatch } from './tableauTypes';

interface TableauSignaturesModalProps {
  match: TableauMatch;
  competitionId?: string;
  onClose: () => void;
}

interface ArenaOption {
  id: string;
  number: number;
  name: string;
  status: string;
}

const SIG_IMG_STYLE: React.CSSProperties = {
  width: '100%',
  maxHeight: '140px',
  objectFit: 'contain',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
};

const TableauSignaturesModal: React.FC<TableauSignaturesModalProps> = ({ match, competitionId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [sigs, setSigs] = useState<{ A?: string; B?: string }>({});
  const [arenas, setArenas] = useState<ArenaOption[]>([]);
  const [arenaId, setArenaId] = useState('');
  const [sendState, setSendState] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sending, setSending] = useState(false);

  const loadSigs = useCallback(async (isCancelled: () => boolean = () => false) => {
    try {
      const rows = (await window.electronAPI?.db?.getDEMatchSignaturesByMatchIds?.([match.id])) ?? [];
      const out: { A?: string; B?: string } = {};
      for (const row of rows) {
        if (row.fencerId === match.fencerA?.id) out.A = row.signatureData;
        else if (row.fencerId === match.fencerB?.id) out.B = row.signatureData;
      }
      if (!isCancelled()) setSigs(out);
    } catch {
      /* signatures optionnelles */
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, [match.id, match.fencerA?.id, match.fencerB?.id]);

  useEffect(() => {
    let cancelled = false;
    loadSigs(() => cancelled);
    // Rafraîchissement temps réel quand la tablette renvoie les signatures
    const unsub = window.electronAPI?.onTableauSignatureUpdated?.(data => {
      if (data.matchId === match.id) loadSigs(() => cancelled);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [loadSigs, match.id]);

  const fullySigned = !!sigs.A && !!sigs.B;
  const canSend = !loading && !fullySigned && !!competitionId && !!match.fencerA && !!match.fencerB;

  // Pistes disponibles (serveur distant démarré)
  useEffect(() => {
    if (!canSend) return;
    let cancelled = false;
    window.electronAPI?.remote?.getArenas?.(competitionId!)
      .then(res => {
        if (cancelled || !res?.success || !res.arenas) return;
        const list: ArenaOption[] = res.arenas
          .map((a: ArenaOption) => ({ id: a.id, number: a.number, name: a.name, status: a.status }))
          .sort((a: ArenaOption, b: ArenaOption) => a.number - b.number);
        setArenas(list);
        setArenaId(prev => prev || (list.find(a => a.status !== 'in_progress') ?? list[0])?.id || '');
      })
      .catch(() => { /* serveur non démarré */ });
    return () => { cancelled = true; };
  }, [canSend, competitionId]);

  const handleSend = async () => {
    if (!competitionId || !arenaId || !match.fencerA || !match.fencerB) return;
    setSending(true);
    setSendState(null);
    try {
      const pick = (f: NonNullable<TableauMatch['fencerA']>) => ({
        id: f.id,
        firstName: f.firstName,
        lastName: f.lastName,
      });
      const res = await window.electronAPI.remote.requestMatchSignature(competitionId, arenaId, {
        match: { id: match.id, fencerA: pick(match.fencerA), fencerB: pick(match.fencerB) },
        scoreA: match.scoreA ?? 0,
        scoreB: match.scoreB ?? 0,
      });
      const arena = arenas.find(a => a.id === arenaId);
      setSendState(
        res.success
          ? { ok: true, msg: `Signature envoyée sur la piste ${arena?.number ?? ''}` }
          : { ok: false, msg: res.error ?? 'Échec de l’envoi' }
      );
    } catch (e) {
      setSendState({ ok: false, msg: e instanceof Error ? e.message : 'Échec de l’envoi' });
    } finally {
      setSending(false);
    }
  };

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

  // Portail sur body : échappe aux ancêtres transformés (animations de phase)
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h3 className="modal-title">Signatures du match</h3>
          <button className="btn-close" onClick={onClose} aria-label="Fermer">&times;</button>
        </div>
        <div className="modal-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {renderFencer('A')}
          {renderFencer('B')}
          {canSend && (
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Renvoyer la signature sur une piste</div>
              {arenas.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: '0.8rem', fontStyle: 'italic' }}>
                  Serveur distant non démarré ou aucune piste disponible
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    className="form-input"
                    value={arenaId}
                    onChange={e => { setArenaId(e.target.value); setSendState(null); }}
                    aria-label="Piste"
                    style={{ flex: 1 }}
                  >
                    {arenas.map(a => (
                      <option key={a.id} value={a.id}>
                        Piste {a.number}{a.status === 'in_progress' ? ' (match en cours)' : ''}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary" onClick={handleSend} disabled={!arenaId || sending}>
                    {sending ? 'Envoi…' : 'Envoyer'}
                  </button>
                </div>
              )}
              {sendState && (
                <div style={{ fontSize: '0.8rem', color: sendState.ok ? '#059669' : '#dc2626' }}>{sendState.msg}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TableauSignaturesModal;
