// @vitest-environment jsdom
/**
 * Tests de composant - horodatage d'AnalyticsDashboard (#1293)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('../hooks/useFocusTrap', () => ({ useFocusTrap: () => ({ current: null }) }));
import { AnalyticsDashboard } from './AnalyticsDashboard';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const lastUpdateText = () =>
  screen.getByText('analytics.last_update').nextElementSibling?.textContent;

describe('AnalyticsDashboard', () => {
  it("n'avance l'horodatage que lorsque les données changent, sans timer", () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T10:00:00') });
    const spy = vi.spyOn(globalThis, 'setInterval');
    const empty: any[] = [];
    const props: any = { competition: { id: 'c1' }, pools: [], fencers: [], onClose: () => {} };
    const { rerender } = render(<AnalyticsDashboard {...props} matches={empty} />);
    const first = lastUpdateText();
    expect(spy).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(lastUpdateText()).toBe(first);
    rerender(<AnalyticsDashboard {...props} matches={empty} />);
    expect(lastUpdateText()).toBe(first);
    vi.setSystemTime(new Date('2026-01-01T10:05:00'));
    rerender(<AnalyticsDashboard {...props} matches={[{ id: 'm', status: 'x' }]} />);
    expect(lastUpdateText()).not.toBe(first);
  });
});
