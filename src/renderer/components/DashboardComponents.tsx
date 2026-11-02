/**
 * BellePoule Modern - Dashboard & Charts Components
 * Modern data visualization components
 * Licensed under GPL-3.0
 */

import React from 'react';
import { useTranslation } from '../hooks/useTranslation';

// Modern Stat Card with icon and trend
interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  trend?: { value: number; isPositive: boolean };
  color: 'blue' | 'green' | 'orange' | 'purple' | 'red';
}

const ModernStatCard_: React.FC<StatCardProps> = ({ title, value, icon, trend, color }) => {
  const { t } = useTranslation();
  const colors = {
    blue: { bg: '#eff6ff', icon: '#3b82f6', text: '#1e40af' },
    green: { bg: '#f0fdf4', icon: '#10b981', text: '#065f46' },
    orange: { bg: '#fff7ed', icon: '#f97316', text: '#9a3412' },
    purple: { bg: '#faf5ff', icon: '#a855f7', text: '#6b21a8' },
    red: { bg: '#fef2f2', icon: '#ef4444', text: '#991b1b' },
  };

  const theme = colors[color];

  return (
    <div className="is-88fce2">
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '12px',
          backgroundColor: theme.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.75rem',
        }}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="is-42620a">{title}</p>
        <h3 className="is-57bffa">{value}</h3>
        {trend && (
          <div className="is-b52e93">
            <span
              style={{
                color: trend.isPositive ? '#10b981' : '#ef4444',
                fontSize: '0.75rem',
                fontWeight: '600',
              }}
            >
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </span>
            <span className="is-99ac94">{t('dashboardCards.vs_last_month')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Activity Timeline
interface TimelineItem {
  id: string;
  time: string;
  title: string;
  description?: string;
  icon: string;
  color: string;
}

const ActivityTimeline_: React.FC<{ items: TimelineItem[] }> = ({ items }) => {
  return (
    <div className="is-f8d354">
      {items.map((item, index) => (
        <div key={item.id} className="is-c3cda5">
          {/* Line */}
          {index < items.length - 1 && <div className="is-2cd34f" />}

          {/* Icon */}
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: item.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.125rem',
              flexShrink: 0,
              zIndex: 1,
            }}
          >
            {item.icon}
          </div>

          {/* Content */}
          <div className="is-22a122">
            <p className="is-61926d">{item.time}</p>
            <h4 className="is-ce741b">{item.title}</h4>
            {item.description && <p className="is-375b4e">{item.description}</p>}
          </div>
        </div>
      ))}
    </div>
  );
};

// Mini Chart (Sparkline)
const Sparkline_: React.FC<{
  data: number[];
  color?: string;
  height?: number;
}> = ({ data, color = '#3b82f6', height = 40 }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height, width: '100%' }}>
      <polyline fill="none" stroke={color} strokeWidth="3" points={points} className="is-e1acc6" />
      <polygon fill={`${color}20`} stroke="none" points={`0,100 ${points} 100,100`} />
    </svg>
  );
};

// Comparison Bar
const ComparisonBar_: React.FC<{
  label: string;
  valueA: number;
  valueB: number;
  labelA: string;
  labelB: string;
  colorA?: string;
  colorB?: string;
}> = ({ label, valueA, valueB, labelA, labelB, colorA = '#3b82f6', colorB = '#10b981' }) => {
  const total = valueA + valueB || 1;
  const percentA = (valueA / total) * 100;
  const percentB = (valueB / total) * 100;

  return (
    <div className="is-045aac">
      <div className="is-91b3c5">
        <span className="is-2979d7">{label}</span>
        <div className="is-708424">
          <span style={{ color: colorA }}>
            {labelA}: {valueA}
          </span>
          <span style={{ color: colorB }}>
            {labelB}: {valueB}
          </span>
        </div>
      </div>
      <div className="is-6892de">
        <div
          style={{
            width: `${percentA}%`,
            backgroundColor: colorA,
            transition: 'width 0.5s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '0.6875rem',
            fontWeight: '600',
          }}
        >
          {percentA > 15 && `${Math.round(percentA)}%`}
        </div>
        <div
          style={{
            width: `${percentB}%`,
            backgroundColor: colorB,
            transition: 'width 0.5s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '0.6875rem',
            fontWeight: '600',
          }}
        >
          {percentB > 15 && `${Math.round(percentB)}%`}
        </div>
      </div>
    </div>
  );
};

// Leaderboard Item
const LeaderboardItem_: React.FC<{
  rank: number;
  name: string;
  score: number;
  avatar?: string;
  isCurrentUser?: boolean;
}> = ({ rank, name, score, avatar, isCurrentUser }) => {
  const { t } = useTranslation();
  const getRankColor = () => {
    switch (rank) {
      case 1:
        return '#fbbf24'; // gold
      case 2:
        return '#9ca3af'; // silver
      case 3:
        return '#f97316'; // bronze
      default:
        return '#e5e7eb';
    }
  };

  const getRankIcon = () => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return rank;
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: isCurrentUser ? '#eff6ff' : 'white',
        borderRadius: '12px',
        border: isCurrentUser ? '2px solid var(--color-primary)' : '1px solid var(--color-bg)',
        marginBottom: '8px',
        transition: 'all 0.2s',
      }}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          backgroundColor: getRankColor(),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: rank <= 3 ? '20px' : '14px',
          fontWeight: 'bold',
        }}
      >
        {getRankIcon()}
      </div>

      {avatar ? (
        <img src={avatar} alt={name} className="is-20acb1" />
      ) : (
        <div className="is-a3b6ba">{name.charAt(0)}</div>
      )}

      <div className="flex-1">
        <span className="is-394059">{name}</span>
        {isCurrentUser && <span className="is-2a1677">{t('dashboardCards.you')}</span>}
      </div>

      <div className="is-13cbe0">
        <span className="is-5cfc6b">{score}</span>
        <span className="is-165cf2">{t('dashboardCards.pts')}</span>
      </div>
    </div>
  );
};

// Empty State Illustration
const EmptyState_: React.FC<{
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon, title, description, actionLabel, onAction }) => {
  return (
    <div className="is-2e1bdd">
      <div className="is-b0a337">{icon}</div>
      <h3 className="is-a646e7">{title}</h3>
      <p
        style={{
          margin: '0 0 24px 0',
          fontSize: '0.875rem',
          color: 'var(--color-text-light)',
          maxWidth: '400px',
        }}
      >
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            padding: '12px 24px',
            backgroundColor: 'var(--color-primary)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = '#2563eb';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = '#3b82f6';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

// Weather/Condition Widget
const ConditionWidget_: React.FC<{
  condition: 'excellent' | 'good' | 'fair' | 'poor';
  label: string;
  value: string;
}> = ({ condition, label, value }) => {
  const conditions = {
    excellent: { color: '#10b981', icon: '✨', label: 'Excellent' },
    good: { color: '#3b82f6', icon: '👍', label: 'Bon' },
    fair: { color: '#f59e0b', icon: '⚠️', label: 'Moyen' },
    poor: { color: '#ef4444', icon: '🔴', label: 'Faible' },
  };

  const theme = conditions[condition];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: `2px solid ${theme.color}30`,
        boxShadow: `0 4px 12px ${theme.color}20`,
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: `${theme.color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
        }}
      >
        {theme.icon}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-light)' }}>{label}</p>
        <p
          style={{
            margin: '2px 0 0 0',
            fontSize: '1.125rem',
            fontWeight: 'bold',
            color: theme.color,
          }}
        >
          {value}
        </p>
      </div>
    </div>
  );
};

export const ModernStatCard = React.memo(ModernStatCard_);
export const ActivityTimeline = React.memo(ActivityTimeline_);
export const Sparkline = React.memo(Sparkline_);
export const ComparisonBar = React.memo(ComparisonBar_);
export const LeaderboardItem = React.memo(LeaderboardItem_);
export const EmptyState = React.memo(EmptyState_);
export const ConditionWidget = React.memo(ConditionWidget_);

export default {
  ModernStatCard,
  ActivityTimeline,
  Sparkline,
  ComparisonBar,
  LeaderboardItem,
  EmptyState,
  ConditionWidget,
};
