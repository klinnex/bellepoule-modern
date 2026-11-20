/**
 * Tests unitaires pour la résolution de conflits (mode hors-ligne)
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import { resolveConflict, mergeActionsById, detectConflicts } from './conflictResolution';

// ============================================================================
// Types de test
// ============================================================================

interface TestItem {
  id: string;
  name: string;
  updatedAt?: Date;
}

// ============================================================================
// Tests pour resolveConflict
// ============================================================================

describe('resolveConflict', () => {
  describe('Cas sans conflit', () => {
    it('retourne local si remote est null', () => {
      const local: TestItem = { id: '1', name: 'Local', updatedAt: new Date() };

      const result = resolveConflict(local, null);

      expect(result.resolved).toEqual(local);
      expect(result.wasConflict).toBe(false);
      expect(result.resolution).toBe('local');
    });

    it('retourne remote si local est null', () => {
      const remote: TestItem = { id: '1', name: 'Remote', updatedAt: new Date() };

      const result = resolveConflict(null, remote);

      expect(result.resolved).toEqual(remote);
      expect(result.wasConflict).toBe(false);
      expect(result.resolution).toBe('remote');
    });

    it('retourne local si les deux sont null', () => {
      const result = resolveConflict<TestItem>(null, null);

      expect(result.resolved).toBeNull();
      expect(result.wasConflict).toBe(false);
    });

    it('retourne local si timestamps identiques', () => {
      const timestamp = new Date('2026-02-21T10:00:00Z');
      const local: TestItem = { id: '1', name: 'Local', updatedAt: timestamp };
      const remote: TestItem = { id: '1', name: 'Remote', updatedAt: timestamp };

      const result = resolveConflict(local, remote);

      expect(result.resolved).toEqual(local);
      expect(result.wasConflict).toBe(false);
    });
  });

  describe('Résolution de conflits', () => {
    it('préfère la version la plus récente (local)', () => {
      const local: TestItem = {
        id: '1',
        name: 'Local récent',
        updatedAt: new Date('2026-02-21T12:00:00Z'),
      };
      const remote: TestItem = {
        id: '1',
        name: 'Remote ancien',
        updatedAt: new Date('2026-02-21T10:00:00Z'),
      };

      const result = resolveConflict(local, remote);

      expect(result.resolved).toEqual(local);
      expect(result.wasConflict).toBe(true);
      expect(result.resolution).toBe('local');
    });

    it('préfère la version la plus récente (remote)', () => {
      const local: TestItem = {
        id: '1',
        name: 'Local ancien',
        updatedAt: new Date('2026-02-21T08:00:00Z'),
      };
      const remote: TestItem = {
        id: '1',
        name: 'Remote récent',
        updatedAt: new Date('2026-02-21T14:00:00Z'),
      };

      const result = resolveConflict(local, remote);

      expect(result.resolved).toEqual(remote);
      expect(result.wasConflict).toBe(true);
      expect(result.resolution).toBe('remote');
    });
  });

  describe('Gestion des timestamps manquants', () => {
    it('gère local sans timestamp', () => {
      const local: TestItem = { id: '1', name: 'Local' };
      const remote: TestItem = {
        id: '1',
        name: 'Remote',
        updatedAt: new Date('2026-02-21T10:00:00Z'),
      };

      const result = resolveConflict(local, remote);

      expect(result.resolved).toEqual(remote);
      expect(result.wasConflict).toBe(true);
    });

    it('gère remote sans timestamp', () => {
      const local: TestItem = {
        id: '1',
        name: 'Local',
        updatedAt: new Date('2026-02-21T10:00:00Z'),
      };
      const remote: TestItem = { id: '1', name: 'Remote' };

      const result = resolveConflict(local, remote);

      expect(result.resolved).toEqual(local);
      expect(result.wasConflict).toBe(true);
    });

    it('préfère local si aucun timestamp', () => {
      const local: TestItem = { id: '1', name: 'Local' };
      const remote: TestItem = { id: '1', name: 'Remote' };

      const result = resolveConflict(local, remote);

      expect(result.resolved).toEqual(local);
      expect(result.wasConflict).toBe(false);
    });
  });
});

// ============================================================================
// Tests pour mergeActionsById
// ============================================================================

describe('mergeActionsById', () => {
  it('fusionne des listes sans doublons', () => {
    const local: TestItem[] = [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
    ];
    const remote: TestItem[] = [
      { id: '3', name: 'Item 3' },
      { id: '4', name: 'Item 4' },
    ];

    const result = mergeActionsById(local, remote);

    expect(result).toHaveLength(4);
    expect(result.map(i => i.id).sort()).toEqual(['1', '2', '3', '4']);
  });

  it('garde la version la plus récente en cas de doublon', () => {
    const local: TestItem[] = [
      { id: '1', name: 'Local ancien', updatedAt: new Date('2026-02-21T08:00:00Z') },
    ];
    const remote: TestItem[] = [
      { id: '1', name: 'Remote récent', updatedAt: new Date('2026-02-21T12:00:00Z') },
    ];

    const result = mergeActionsById(local, remote);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Remote récent');
  });

  it('garde la version locale si plus récente', () => {
    const local: TestItem[] = [
      { id: '1', name: 'Local récent', updatedAt: new Date('2026-02-21T14:00:00Z') },
    ];
    const remote: TestItem[] = [
      { id: '1', name: 'Remote ancien', updatedAt: new Date('2026-02-21T10:00:00Z') },
    ];

    const result = mergeActionsById(local, remote);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Local récent');
  });

  it('gère les listes vides', () => {
    expect(mergeActionsById([], [])).toHaveLength(0);
    expect(mergeActionsById([{ id: '1', name: 'A' }], [])).toHaveLength(1);
    expect(mergeActionsById([], [{ id: '1', name: 'B' }])).toHaveLength(1);
  });

  it('préserve tous les items sans timestamp en cas de conflit', () => {
    const local: TestItem[] = [{ id: '1', name: 'Local' }];
    const remote: TestItem[] = [{ id: '1', name: 'Remote' }];

    const result = mergeActionsById(local, remote);

    // Sans timestamp, local gagne (car ajouté en premier)
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Local');
  });
});

// ============================================================================
// Tests pour detectConflicts
// ============================================================================

describe('detectConflicts', () => {
  it('détecte les items uniquement locaux', () => {
    const local: TestItem[] = [
      { id: '1', name: 'Local only' },
      { id: '2', name: 'Shared' },
    ];
    const remote: TestItem[] = [{ id: '2', name: 'Shared' }];

    const result = detectConflicts(local, remote);

    expect(result.localOnly).toHaveLength(1);
    expect(result.localOnly[0].id).toBe('1');
  });

  it('détecte les items uniquement distants', () => {
    const local: TestItem[] = [{ id: '1', name: 'Shared' }];
    const remote: TestItem[] = [
      { id: '1', name: 'Shared' },
      { id: '2', name: 'Remote only' },
    ];

    const result = detectConflicts(local, remote);

    expect(result.remoteOnly).toHaveLength(1);
    expect(result.remoteOnly[0].id).toBe('2');
  });

  it('détecte les conflits (timestamps différents)', () => {
    const local: TestItem[] = [
      { id: '1', name: 'Local version', updatedAt: new Date('2026-02-21T10:00:00Z') },
    ];
    const remote: TestItem[] = [
      { id: '1', name: 'Remote version', updatedAt: new Date('2026-02-21T12:00:00Z') },
    ];

    const result = detectConflicts(local, remote);

    expect(result.conflicted).toHaveLength(1);
    expect(result.conflicted[0].local.name).toBe('Local version');
    expect(result.conflicted[0].remote.name).toBe('Remote version');
  });

  it('ne détecte pas de conflit si timestamps identiques', () => {
    const timestamp = new Date('2026-02-21T10:00:00Z');
    const local: TestItem[] = [{ id: '1', name: 'Same', updatedAt: timestamp }];
    const remote: TestItem[] = [{ id: '1', name: 'Same', updatedAt: timestamp }];

    const result = detectConflicts(local, remote);

    expect(result.conflicted).toHaveLength(0);
  });

  it('gère les listes vides', () => {
    const result = detectConflicts<TestItem>([], []);

    expect(result.localOnly).toHaveLength(0);
    expect(result.remoteOnly).toHaveLength(0);
    expect(result.conflicted).toHaveLength(0);
  });

  it('cas complexe avec tous types', () => {
    const local: TestItem[] = [
      { id: '1', name: 'Local only' },
      { id: '2', name: 'Shared same', updatedAt: new Date('2026-02-21T10:00:00Z') },
      { id: '3', name: 'Conflict local', updatedAt: new Date('2026-02-21T08:00:00Z') },
    ];
    const remote: TestItem[] = [
      { id: '2', name: 'Shared same', updatedAt: new Date('2026-02-21T10:00:00Z') },
      { id: '3', name: 'Conflict remote', updatedAt: new Date('2026-02-21T12:00:00Z') },
      { id: '4', name: 'Remote only' },
    ];

    const result = detectConflicts(local, remote);

    expect(result.localOnly).toHaveLength(1);
    expect(result.localOnly[0].id).toBe('1');

    expect(result.remoteOnly).toHaveLength(1);
    expect(result.remoteOnly[0].id).toBe('4');

    expect(result.conflicted).toHaveLength(1);
    expect(result.conflicted[0].local.id).toBe('3');
  });
});
