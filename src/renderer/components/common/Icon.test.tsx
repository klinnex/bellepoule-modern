// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Zap } from 'lucide-react';
import { Icon } from './Icon';

describe('Icon', () => {
  it('est masquée aux lecteurs d’écran par défaut', () => {
    const { container } = render(<Icon icon={Zap} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('width')).toBe('16');
  });

  it('expose un nom accessible avec label', () => {
    const { container } = render(<Icon icon={Zap} size={24} label="Éclair" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
    expect(svg?.getAttribute('aria-label')).toBe('Éclair');
    expect(svg?.getAttribute('width')).toBe('24');
  });
});
