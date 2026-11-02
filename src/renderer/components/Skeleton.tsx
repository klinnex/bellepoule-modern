/**
 * BellePoule Modern - Skeleton Loading Components
 * UX Improvement: Better loading states
 * Licensed under GPL-3.0
 */

import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

const Skeleton_: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '20px',
  borderRadius = '4px',
  className,
  style,
}) => {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius,
        ...style,
        background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        opacity: 0.7,
      }}
    />
  );
};

// Competition Card Skeleton
const CompetitionCardSkeleton_: React.FC = () => {
  return (
    <div className="is-c2432b">
      <div className="u-row-between">
        <Skeleton width="60%" height="24px" />
        <Skeleton width="80px" height="20px" borderRadius="12px" />
      </div>
      <Skeleton width="40%" height="16px" />
      <div className="is-1acd33">
        <Skeleton width="100px" height="32px" borderRadius="6px" />
        <Skeleton width="100px" height="32px" borderRadius="6px" />
      </div>
    </div>
  );
};

// Pool View Skeleton
const PoolViewSkeleton_: React.FC = () => {
  return (
    <div className="is-f8d354">
      <div className="is-8d7033">
        <Skeleton width="200px" height="32px" style={{ marginBottom: '16px' }} />
        <div className="is-f38ad5">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="is-7cfc05">
              <Skeleton width="50%" height="20px" style={{ marginBottom: '12px' }} />
              {[1, 2, 3].map(j => (
                <div
                  key={j}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    padding: '8px 0',
                    borderBottom: j < 3 ? '1px solid var(--color-bg)' : 'none',
                  }}
                >
                  <Skeleton width="40%" height="16px" />
                  <Skeleton width="60px" height="16px" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Table Row Skeleton
const TableRowSkeleton_: React.FC<{ columns?: number }> = ({ columns = 5 }) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: '16px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-border)',
        alignItems: 'center',
      }}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} width={i === 0 ? '80%' : '60%'} height="16px" />
      ))}
    </div>
  );
};

// Stats Card Skeleton
const StatsCardSkeleton_: React.FC = () => {
  return (
    <div className="is-0ae110">
      <Skeleton width="48px" height="48px" borderRadius="12px" />
      <div className="flex-1">
        <Skeleton width="60%" height="16px" style={{ marginBottom: '8px' }} />
        <Skeleton width="40%" height="28px" />
      </div>
    </div>
  );
};

// Competition View Skeleton (header + nav + content, pendant le lazy-load de CompetitionView)
const CompetitionViewSkeleton_: React.FC = () => {
  return (
    <div className="is-07f002">
      <div className="is-b69013">
        <Skeleton width="280px" height="28px" />
        <Skeleton width="120px" height="32px" borderRadius="6px" />
      </div>
      <div className="is-c6beb3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} width="110px" height="36px" borderRadius="6px" />
        ))}
      </div>
      <div className="is-5a67a8">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="is-1f7187">
            <Skeleton width="60%" height="18px" style={{ marginBottom: '0.75rem' }} />
            <Skeleton width="100%" height="14px" className="mb-2" />
            <Skeleton width="80%" height="14px" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const Skeleton = React.memo(Skeleton_);
export const CompetitionCardSkeleton = React.memo(CompetitionCardSkeleton_);
export const PoolViewSkeleton = React.memo(PoolViewSkeleton_);
export const TableRowSkeleton = React.memo(TableRowSkeleton_);
export const StatsCardSkeleton = React.memo(StatsCardSkeleton_);
export const CompetitionViewSkeleton = React.memo(CompetitionViewSkeleton_);

export default {
  Skeleton,
  CompetitionCardSkeleton,
  PoolViewSkeleton,
  TableRowSkeleton,
  StatsCardSkeleton,
  CompetitionViewSkeleton,
};
