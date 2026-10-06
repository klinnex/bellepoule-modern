/**
 * BellePoule Modern - CoachMark Component
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useLayoutEffect } from 'react';

interface CoachMarkProps {
  id?: string;
  message: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

const CoachMark: React.FC<CoachMarkProps> = ({ message, position = 'bottom', children }) => {
  // Sous-titre affiché uniquement au survol / focus du bouton
  const [visible, setVisible] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!visible || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    if (position === 'top') setPos({ top: r.top - 8, left: r.left + r.width / 2 });
    else if (position === 'left') setPos({ top: r.top + r.height / 2, left: r.left - 8 });
    else if (position === 'right') setPos({ top: r.top + r.height / 2, left: r.right + 8 });
    else setPos({ top: r.bottom + 8, left: r.left + r.width / 2 });
  }, [visible, position]);

  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    zIndex: 99999,
    background: '#1e40af',
    color: 'white',
    padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem',
    fontSize: '0.8rem',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    pointerEvents: 'none',
    ...(position === 'bottom'
      ? { transform: 'translateX(-50%)' }
      : position === 'top'
        ? { transform: 'translate(-50%, -100%)' }
        : position === 'right'
          ? { transform: 'translateY(-50%)' }
          : { transform: 'translate(-100%, -50%)' }),
  };

  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    width: 0,
    height: 0,
    ...(position === 'bottom'
      ? {
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderBottom: '5px solid #1e40af',
        }
      : position === 'top'
        ? {
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid #1e40af',
          }
        : {}),
  };

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div style={tooltipStyle}>
          <span style={arrowStyle} />
          {message}
        </div>
      )}
    </div>
  );
};

export default React.memo(CoachMark);
