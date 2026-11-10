// @vitest-environment jsdom
/**
 * Tests de la ligne URL + copier + QR code (#1414)
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { UrlCopyRow } from './UrlCopyRow';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('UrlCopyRow', () => {
  it('copie l’URL et ouvre le QR code', () => {
    const onCopy = vi.fn();
    const onQr = vi.fn();
    render(
      <UrlCopyRow url="http://x/kiosk" id={999} copiedIndex={null} onCopy={onCopy} onQr={onQr} />
    );
    expect(screen.getByText('http://x/kiosk')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('rsm.copy_url'));
    expect(onCopy).toHaveBeenCalledWith('http://x/kiosk', 999);
    fireEvent.click(screen.getByLabelText('rsm.qr_code'));
    expect(onQr).toHaveBeenCalled();
  });

  it('affiche « Copié » sur la ligne copiée', () => {
    render(<UrlCopyRow url="u" id={5} copiedIndex={5} onCopy={vi.fn()} onQr={vi.fn()} />);
    expect(screen.getByText('rsm.copied_short')).toBeInTheDocument();
  });
});
