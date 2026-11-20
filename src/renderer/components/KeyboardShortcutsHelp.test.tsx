// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';

vi.mock('../contexts/TranslationContext', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

describe('KeyboardShortcutsHelp (#1533)', () => {
  it('documente la navigation entre phases : Ctrl + 1…8 et Ctrl + ←/→', () => {
    render(<KeyboardShortcutsHelp />);
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByText('Ctrl + 1…8')).toBeTruthy();
    expect(screen.getByText('shortcuts.goto_phase')).toBeTruthy();
    expect(screen.getByText('Ctrl + ←')).toBeTruthy();
    expect(screen.getByText('Ctrl + →')).toBeTruthy();
  });
});
