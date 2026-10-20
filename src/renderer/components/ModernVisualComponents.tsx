import React from 'react';

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
}

const ModernThemeToggle_: React.FC<ThemeToggleProps> = ({ isDark, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '64px',
        height: '32px',
        borderRadius: '16px',
        border: '2px solid var(--color-border)',
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        padding: '2px',
        display: 'flex',
        alignItems: 'center',
      }}
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
    >
      {/* Sun Icon */}
      <span
        style={{
          position: 'absolute',
          left: '8px',
          fontSize: '0.875rem',
          opacity: isDark ? 0 : 1,
          transition: 'opacity 0.3s',
        }}
      >
        ☀️
      </span>

      {/* Moon Icon */}
      <span
        style={{
          position: 'absolute',
          right: '8px',
          fontSize: '0.875rem',
          opacity: isDark ? 1 : 0,
          transition: 'opacity 0.3s',
        }}
      >
        🌙
      </span>

      {/* Toggle Circle */}
      <div
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: isDark ? 'var(--color-primary)' : '#f59e0b',
          transform: isDark ? 'translateX(32px)' : 'translateX(0)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '0.75rem' }}>{isDark ? '🌑' : '☀️'}</span>
      </div>
    </button>
  );
};

// Glassmorphism Card
const GlassCard_: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => {
  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(10px)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        padding: '24px',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// Animated Counter
const AnimatedCounter_: React.FC<{ value: number; duration?: number }> = ({
  value,
  duration = 1000,
}) => {
  const [displayValue, setDisplayValue] = React.useState(0);

  React.useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);

      // Easing function
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.floor(easeOutQuart * value));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return (
    <span
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 'bold',
      }}
    >
      {displayValue}
    </span>
  );
};

// Ripple Button
const RippleButton_: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }
> = ({ children, variant = 'primary', style, ...props }) => {
  const [ripples, setRipples] = React.useState<{ x: number; y: number; id: number }[]>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now();

    setRipples(prev => [...prev, { x, y, id }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 600);
  };

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return { background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white' };
      case 'danger':
        return { background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white' };
      case 'secondary':
        return { background: '#f3f4f6', color: '#374151' };
    }
  };

  return (
    <button
      onClick={handleClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '12px 24px',
        borderRadius: '8px',
        border: 'none',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'transform 0.1s, box-shadow 0.2s',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        ...getVariantStyles(),
        ...style,
      }}
      onMouseDown={e => {
        e.currentTarget.style.transform = 'scale(0.98)';
      }}
      onMouseUp={e => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      {...props}
    >
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          style={{
            position: 'absolute',
            left: ripple.x,
            top: ripple.y,
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.6)',
            transform: 'translate(-50%, -50%)',
            animation: 'ripple 0.6s ease-out',
            pointerEvents: 'none',
          }}
        />
      ))}
      {children}
      <style>{`
        @keyframes ripple {
          to {
            width: 200px;
            height: 200px;
            opacity: 0;
          }
        }
      `}</style>
    </button>
  );
};

// Gradient Text
const GradientText_: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <span
      style={{
        background: 'linear-gradient(135deg, var(--color-primary), #8b5cf6, #ec4899)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        fontWeight: 'bold',
      }}
    >
      {children}
    </span>
  );
};

// Status Badge
const StatusBadge_: React.FC<{
  status: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  children: React.ReactNode;
  pulse?: boolean;
}> = ({ status, children, pulse = false }) => {
  const colors = {
    success: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
    warning: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
    error: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
    info: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
    neutral: { bg: '#f3f4f6', text: '#374151', border: '#9ca3af' },
  };

  const color = colors[status];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '9999px',
        backgroundColor: color.bg,
        color: color.text,
        fontSize: '0.75rem',
        fontWeight: '600',
        border: `1px solid ${color.border}`,
      }}
    >
      {pulse && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: color.border,
            animation: 'pulse 2s infinite',
          }}
        />
      )}
      {children}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </span>
  );
};

// Floating Action Button
const FloatingActionButton_: React.FC<{
  icon: string;
  onClick: () => void;
  label?: string;
}> = ({ icon, onClick, label }) => {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--color-primary), #8b5cf6)',
        border: 'none',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
        cursor: 'pointer',
        fontSize: '1.5rem',
        color: 'white',
        transition: 'all 0.3s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.1) rotate(90deg)';
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.6)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
      }}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
};

// Progress Ring
const ProgressRing_: React.FC<{
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}> = ({ progress, size = 60, strokeWidth = 4, color = '#3b82f6' }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '0.875rem',
          fontWeight: 'bold',
          color: 'var(--color-text)',
        }}
      >
        {Math.round(progress)}%
      </span>
    </div>
  );
};

// Hover Card
const HoverCard_: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid var(--color-border)',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 12px 24px -8px rgba(0, 0, 0, 0.15)';
        e.currentTarget.style.borderColor = '#3b82f6';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = '#e5e7eb';
      }}
    >
      {children}
    </div>
  );
};

// Confetti Celebration
const Confetti_: React.FC<{ trigger: boolean }> = ({ trigger }) => {
  const [particles, setParticles] = React.useState<
    Array<{
      id: number;
      x: number;
      y: number;
      color: string;
      rotation: number;
    }>
  >([]);

  React.useEffect(() => {
    if (trigger) {
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
      const newParticles = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        x: Math.random() * window.innerWidth,
        y: -20,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
      }));
      setParticles(newParticles);

      setTimeout(() => setParticles([]), 3000);
    }
  }, [trigger]);

  if (particles.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        overflow: 'hidden',
      }}
    >
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: '10px',
            height: '10px',
            backgroundColor: p.color,
            transform: `rotate(${p.rotation}deg)`,
            animation: `confetti-fall 3s ease-out forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(${window.innerHeight}px) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export const ModernThemeToggle = React.memo(ModernThemeToggle_);
export const GlassCard = React.memo(GlassCard_);
export const AnimatedCounter = React.memo(AnimatedCounter_);
export const RippleButton = React.memo(RippleButton_);
export const GradientText = React.memo(GradientText_);
export const StatusBadge = React.memo(StatusBadge_);
export const FloatingActionButton = React.memo(FloatingActionButton_);
export const ProgressRing = React.memo(ProgressRing_);
export const HoverCard = React.memo(HoverCard_);
export const Confetti = React.memo(Confetti_);

export default {
  ModernThemeToggle,
  GlassCard,
  AnimatedCounter,
  RippleButton,
  GradientText,
  StatusBadge,
  FloatingActionButton,
  ProgressRing,
  HoverCard,
  Confetti,
};
