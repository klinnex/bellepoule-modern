import { describe, it, expect } from 'vitest';
import { actionableMessage, classifyError, ERROR_HINT_KEYS } from './actionableError';

describe('classifyError', () => {
  it.each([
    [Object.assign(new Error('x'), { code: 'ENOENT' }), 'file_missing'],
    [
      new Error("Error invoking remote method: EACCES: permission denied, open 'a.bpf'"),
      'permission',
    ],
    [new Error('EBUSY: resource busy or locked'), 'file_busy'],
    [new Error('ENOSPC: no space left on device'), 'disk_full'],
    [new Error('connect ECONNREFUSED 127.0.0.1:8066'), 'network'],
    [new Error('SQLITE_BUSY: database is locked'), 'db_locked'],
    [new SyntaxError('Unexpected token < in JSON'), 'invalid_format'],
    [new Error('boom'), 'unknown'],
    ['ENOENT', 'file_missing'],
    [null, 'unknown'],
  ])('%s -> %s', (err, expected) => {
    expect(classifyError(err)).toBe(expected);
  });

  it('chaque cause a une clé i18n errors.hint_*', () => {
    for (const key of Object.values(ERROR_HINT_KEYS)) expect(key).toMatch(/^errors\.hint_/);
  });
});

describe('actionableMessage', () => {
  it('compose base et conseil', () => {
    const t = (k: string) => `[${k}]`;
    expect(actionableMessage(t, 'Export échoué', new Error('ENOSPC'))).toBe(
      'Export échoué — [errors.hint_disk_full]'
    );
  });
});
