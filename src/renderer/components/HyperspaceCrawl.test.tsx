// @vitest-environment jsdom
/**
 * Tests de composant - HyperspaceCrawl (easter egg du numéro de build)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('../hooks/useTranslation', () => import('../testUtils/i18nMock'));
import HyperspaceCrawl, { toRoman, warpSpeed, CRAWL_TITLE_COUNT } from './HyperspaceCrawl';
import AboutModal from './AboutModal';

beforeEach(() => {
  // jsdom : pas de canvas 2D
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

describe('toRoman', () => {
  it('convertit en chiffres romains', () => {
    expect(toRoman(1)).toBe('I');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(42)).toBe('XLII');
    expect(toRoman(1994)).toBe('MCMXCIV');
    expect(toRoman(3999)).toBe('MMMCMXCIX');
  });

  it('retombe en chiffres arabes hors bornes', () => {
    expect(toRoman(0)).toBe('0');
    expect(toRoman(4000)).toBe('4000');
    expect(toRoman(undefined)).toBe('?');
  });
});

describe('warpSpeed', () => {
  it('accélère au saut puis revient en croisière', () => {
    expect(warpSpeed(0)).toBeLessThan(1);
    expect(warpSpeed(1.5)).toBeGreaterThan(40);
    expect(warpSpeed(5)).toBeLessThan(1);
  });
});

describe('HyperspaceCrawl', () => {
  it('affiche épisode romain, titre et build', () => {
    render(<HyperspaceCrawl build={42} onDone={vi.fn()} />);
    expect(screen.getByText('Épisode XLII')).toBeInTheDocument();
    expect(CRAWL_TITLE_COUNT).toBe(7);
    // 42 % 7 = 0
    expect(screen.getByText('La Menace Fléchette')).toBeInTheDocument();
    expect(screen.getByText(/build #42/)).toBeInTheDocument();
  });

  it('clic ferme', () => {
    const onDone = vi.fn();
    render(<HyperspaceCrawl build={1} onDone={onDone} />);
    fireEvent.click(screen.getByTestId('hyperspace-crawl'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Échap ferme le crawl sans fermer la modale À propos', () => {
    const onClose = vi.fn();
    render(<AboutModal onClose={onClose} />);
    fireEvent.doubleClick(screen.getByTitle('Double-clic pour une surprise…'));
    expect(screen.getByTestId('hyperspace-crawl')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByTestId('hyperspace-crawl')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Entrée sur le numéro de build lance le crawl', () => {
    render(<AboutModal onClose={vi.fn()} />);
    fireEvent.keyDown(screen.getByTitle('Double-clic pour une surprise…'), { key: 'Enter' });
    expect(screen.getByTestId('hyperspace-crawl')).toBeInTheDocument();
  });
});

describe('playBladeMarch', () => {
  it('programme un swish + un clang par note de la marche', async () => {
    const { playBladeMarch, IMPERIAL_MARCH, BLADE_PARTIALS } = await import('./crawlMusic');
    const param = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });
    const node = () => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      gain: param(),
      frequency: param(),
      detune: param(),
      pan: param(),
      Q: param(),
      buffer: null as unknown,
      type: '',
    });
    const counts = { osc: 0, noise: 0 };
    const ctx = {
      currentTime: 0,
      sampleRate: 44100,
      destination: {},
      createGain: node,
      createBiquadFilter: node,
      createStereoPanner: node,
      createConvolver: node,
      createDynamicsCompressor: node,
      createOscillator: () => (counts.osc++, node()),
      createBufferSource: () => (counts.noise++, node()),
      createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    };
    playBladeMarch(ctx as unknown as AudioContext, 0);
    expect(counts.noise).toBe(IMPERIAL_MARCH.length * 2);
    expect(counts.osc).toBe(IMPERIAL_MARCH.length * BLADE_PARTIALS.length);
  });
});
