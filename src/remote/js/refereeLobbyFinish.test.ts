/**
 * Retour au lobby après match en entraînement (#1826) : « terminer » et « vainqueur au score »
 * appellent le hook du lobby ; hors entraînement le hook est sans effet.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const L = req('./refereeLobby.js');

describe('retour lobby après match (#1826)', () => {
  it('onMatchFinished hors entraînement : sans effet, ne lève pas', () => {
    expect(() => L.onMatchFinished()).not.toThrow();
  });

  it('refereeApp.js appelle le hook dans les deux chemins de fin de match', () => {
    const src = fs.readFileSync(path.join(__dirname, 'refereeApp.js'), 'utf8');
    const calls = src.match(/BPRefereeLobby\?\.onMatchFinished\?\.\(\)/g) ?? [];
    expect(calls.length).toBe(2);
  });

  it('la remise à zéro de piste (scores et chrono) est envoyée à l’arène', () => {
    const src = fs.readFileSync(path.join(__dirname, 'refereeLobby.js'), 'utf8');
    expect(src).toContain("action: 'reset_scores'");
    expect(src).toContain("action: 'reset_timer'");
  });
});
