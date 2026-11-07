// @vitest-environment jsdom
/**
 * Tests de l'intervalle de pistes début/fin (#1501)
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StripRangeControls } from './StripRangeControls';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('StripRangeControls', () => {
  it('incrémente la piste de départ sans dépasser la fin', () => {
    const onChange = vi.fn();
    render(<StripRangeControls start={5} end={8} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('rsm.strip_start +'));
    expect(onChange).toHaveBeenCalledWith(6, 8);
  });

  it('bloque le départ à la fin et la fin au départ', () => {
    render(<StripRangeControls start={3} end={3} onChange={vi.fn()} />);
    expect(screen.getByLabelText('rsm.strip_start +')).toBeDisabled();
    expect(screen.getByLabelText('rsm.strip_end −')).toBeDisabled();
  });

  it('modifie la piste de fin par saisie directe', () => {
    const onChange = vi.fn();
    render(<StripRangeControls start={5} end={8} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('rsm.strip_end'), { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledWith(5, 10);
  });
});
