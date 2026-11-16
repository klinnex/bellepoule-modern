import { describe, it, expect } from 'vitest';
import { parseCliArgs } from './cliArgs';

describe('parseCliArgs', () => {
  it('sans option : mode fenêtré', () => {
    expect(parseCliArgs(['electron', '.'])).toEqual({ headless: false });
  });

  it('--headless', () => {
    expect(parseCliArgs(['electron', '.', '--headless']).headless).toBe(true);
  });

  it('BELLEPOULE_HEADLESS=1', () => {
    expect(parseCliArgs(['electron', '.'], { BELLEPOULE_HEADLESS: '1' }).headless).toBe(true);
  });

  it('arguments inconnus ignorés', () => {
    expect(parseCliArgs(['app', '--no-sandbox', '--headlessly']).headless).toBe(false);
  });
});
