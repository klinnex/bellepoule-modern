import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ipcErrorText } from './ipcError';
import fr from '../locales/fr.json';

const dict: Record<string, string> = {
  'errors.remote_not_started': "Le serveur distant n'est pas démarré",
  'errors.port_in_use': 'Le port {{port}} est déjà utilisé',
};
const t = (key: string, params?: Record<string, string | number>) =>
  (dict[key] ?? key).replace(/\{\{(\w+)\}\}/g, (m, k) => String(params?.[k] ?? m));

describe('ipcErrorText (#1159)', () => {
  it('code traduit, paramètres de la réponse interpolés', () => {
    expect(ipcErrorText(t, { error: 'remote_not_started' })).toBe(
      "Le serveur distant n'est pas démarré"
    );
    expect(ipcErrorText(t, { error: 'port_in_use', port: 8067 })).toBe(
      'Le port 8067 est déjà utilisé'
    );
  });

  it('texte libre, code inconnu, absence d’erreur', () => {
    expect(ipcErrorText(t, { error: 'Disque plein' })).toBe('Disque plein');
    expect(ipcErrorText(t, { error: 'unknown_code' })).toBe('unknown_code');
    expect(ipcErrorText(t, null, 'repli')).toBe('repli');
  });

  it('chaque code renvoyé par le process principal a sa clé errors.* (fr)', () => {
    const root = path.join(__dirname, '..', '..', 'main');
    const files = ['main.ts', 'ipc/trainingHandlers.ts', 'ipc/dbHandlers.ts'];
    const codes = new Set<string>();
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      for (const m of src.matchAll(/\berror: '([a-z_]+)'/g)) codes.add(m[1]);
    }
    const errors = (fr as unknown as { errors: Record<string, string> }).errors;
    expect(codes.size).toBeGreaterThan(10);
    expect([...codes].filter(c => !(c in errors))).toEqual([]);
  });
});
