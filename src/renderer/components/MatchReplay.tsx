/**
 * BellePoule Modern - Replay d'un match depuis le journal d'audit (#1074)
 * Rejoue les événements un par un : score et cartons à chaque instant.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { MatchEventEntry } from '../../shared/types';
import { buildMatchReplay, formatReplayOffset } from '../../shared/utils/matchReplay';
import { describeMatchEvent } from '../../shared/utils/multiFormatExport';
import { useTranslation } from '../contexts/TranslationContext';

interface MatchReplayProps {
  entries: MatchEventEntry[];
  nameA?: string;
  nameB?: string;
}

const CARD_COLORS: Record<string, string> = {
  white: '#f3f4f6',
  yellow: '#facc15',
  red: '#ef4444',
  black: '#111827',
};

const PLAY_INTERVAL_MS = 1000;

const MatchReplay: React.FC<MatchReplayProps> = ({ entries, nameA, nameB }) => {
  const { t } = useTranslation();
  const frames = useMemo(() => buildMatchReplay(entries), [entries]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = frames.length - 1;

  useEffect(() => setIndex(0), [frames]);

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex(i => Math.min(i + 1, last)), PLAY_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [playing, index, last]);

  if (frames.length === 0) {
    return (
      <div style={{ padding: '1rem', color: 'var(--color-text-light)' }}>{t('replay.empty')}</div>
    );
  }

  const frame = frames[Math.min(index, last)];
  const side = (
    name: string | undefined,
    fallback: string,
    score: number,
    cards: typeof frame.cardsA
  ) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{name || fallback}</div>
      <div style={{ fontSize: '2.5rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </div>
      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', minHeight: '14px' }}>
        {cards.map((c, i) => (
          <span
            key={i}
            title={c.reason ?? c.type}
            style={{
              width: '10px',
              height: '14px',
              borderRadius: '2px',
              border: '1px solid #9ca3af',
              background: CARD_COLORS[c.type] ?? '#9ca3af',
            }}
          />
        ))}
      </div>
    </div>
  );

  const btn: React.CSSProperties = {
    padding: '0.3rem 0.7rem',
    borderRadius: '6px',
    border: '1px solid #374151',
    background: 'transparent',
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '0.75rem',
        marginBottom: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {side(nameA, t('replay.fencer_a'), frame.scoreA, frame.cardsA)}
        <div style={{ color: 'var(--color-text-light)', fontVariantNumeric: 'tabular-nums' }}>
          {formatReplayOffset(frame.offsetMs)}
        </div>
        {side(nameB, t('replay.fencer_b'), frame.scoreB, frame.cardsB)}
      </div>
      <div style={{ textAlign: 'center', fontSize: '0.85rem', margin: '0.5rem 0' }}>
        {describeMatchEvent(frame.entry)}
      </div>
      <input
        type="range"
        min={0}
        max={last}
        value={index}
        onChange={e => {
          setPlaying(false);
          setIndex(Number(e.target.value));
        }}
        aria-label={t('replay.position')}
        style={{ width: '100%' }}
      />
      <div
        style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}
      >
        <button
          style={btn}
          onClick={() => setIndex(i => Math.max(0, i - 1))}
          disabled={index === 0}
          aria-label={t('replay.previous')}
        >
          ⏮
        </button>
        <button
          style={btn}
          onClick={() => {
            if (index >= last) setIndex(0);
            setPlaying(p => !p);
          }}
          aria-label={playing ? t('replay.pause') : t('replay.play')}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          style={btn}
          onClick={() => setIndex(i => Math.min(last, i + 1))}
          disabled={index === last}
          aria-label={t('replay.next')}
        >
          ⏭
        </button>
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
          {t('replay.event_n', { current: index + 1, total: frames.length })}
        </span>
      </div>
    </div>
  );
};

export default MatchReplay;
