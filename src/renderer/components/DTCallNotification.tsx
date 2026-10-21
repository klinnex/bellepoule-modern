/**
 * BellePoule Modern - DT Call Notification
 * Persistent alert panel shown when a referee requests DT intervention
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { formatTime } from '../../shared/utils/localeFormat';

interface DTCallEntry {
  id: string;
  arenaId: string;
  arenaNumber: number | null;
  matchNumber: number | null;
  competitionId: string | null;
  timestamp: number;
  acknowledging: boolean;
  reason?: 'black_card';
  fencerName?: string | null;
}

const DTCallNotification: React.FC = () => {
  const { t } = useTranslation();
  const [calls, setCalls] = useState<DTCallEntry[]>([]);

  useEffect(() => {
    if (!window.electronAPI?.onDTCall) return;
    const unsub = window.electronAPI.onDTCall(data => {
      setCalls(prev => {
        // remplacer un appel existant pour la même arène
        const filtered = prev.filter(c => c.arenaId !== data.arenaId);
        return [
          ...filtered,
          {
            id: `${data.arenaId}-${data.timestamp}`,
            arenaId: data.arenaId,
            arenaNumber: data.arenaNumber,
            matchNumber: data.matchNumber,
            competitionId: data.competitionId,
            timestamp: data.timestamp,
            acknowledging: false,
            reason: data.reason,
            fencerName: data.fencerName,
          },
        ];
      });
      // Alerte sonore
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } catch {
        // AudioContext non disponible
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onDTCallCancel) return;
    const unsub = window.electronAPI.onDTCallCancel(data => {
      setCalls(prev => prev.filter(c => c.arenaId !== data.arenaId));
    });
    return unsub;
  }, []);

  const acknowledge = useCallback(async (call: DTCallEntry) => {
    setCalls(prev => prev.map(c => (c.id === call.id ? { ...c, acknowledging: true } : c)));
    if (call.competitionId) {
      await window.electronAPI.remote.acknowledgeDTCall(call.competitionId, call.arenaId);
    }
    setCalls(prev => prev.filter(c => c.id !== call.id));
  }, []);

  if (calls.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 10001,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '340px',
      }}
    >
      {calls.map(call => (
        <div
          key={call.id}
          style={{
            backgroundColor: '#1f2937',
            borderLeft: call.reason === 'black_card' ? '4px solid #000' : '4px solid #f97316',
            borderRadius: '8px',
            padding: '14px 16px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            color: '#f9fafb',
            animation: 'slideInRight 0.3s ease-out',
          }}
        >
          <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '4px' }}>
            {t('dtCall.title')}
            {call.arenaNumber != null ? t('dtCall.strip', { n: call.arenaNumber }) : ''}
          </div>
          {call.reason === 'black_card' && (
            <div
              style={{
                fontSize: '0.875rem',
                fontWeight: 'bold',
                color: '#fca5a5',
                marginBottom: '4px',
              }}
            >
              {t('dtCall.black_card')}
              {call.fencerName ? ` — ${call.fencerName}` : ''} {t('dtCall.black_card_note')}
            </div>
          )}
          {call.matchNumber != null && (
            <div style={{ fontSize: '0.8125rem', color: '#9ca3af', marginBottom: '4px' }}>
              {t('dtCall.match_n', { n: call.matchNumber })}
            </div>
          )}
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '10px' }}>
            {formatTime(call.timestamp)}
          </div>
          <button
            onClick={() => acknowledge(call)}
            disabled={call.acknowledging}
            style={{
              backgroundColor: call.acknowledging ? '#374151' : '#f97316',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 14px',
              fontSize: '0.8125rem',
              cursor: call.acknowledging ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              width: '100%',
            }}
          >
            {call.acknowledging ? t('dtCall.pending') : t('dtCall.resolve')}
          </button>
        </div>
      ))}
    </div>
  );
};

export default React.memo(DTCallNotification);
