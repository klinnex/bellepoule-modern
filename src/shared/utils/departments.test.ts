/**
 * Tests unitaires - Départements français (#1504)
 */
import { describe, it, expect } from 'vitest';
import { DEPARTMENTS, departmentLabel, departmentName, normalizeDepartment } from './departments';

describe('departments', () => {
  it('codes uniques, Corse et outre-mer inclus', () => {
    const codes = DEPARTMENTS.map(([c]) => c);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(expect.arrayContaining(['01', '2A', '2B', '95', '971', '976']));
  });

  it('normalise la saisie', () => {
    expect(normalizeDepartment('5')).toBe('05');
    expect(normalizeDepartment(' 2a ')).toBe('2A');
    expect(normalizeDepartment('FRA')).toBe('');
    expect(normalizeDepartment(undefined)).toBe('');
  });

  it('nom et libellé', () => {
    expect(departmentName('75')).toBe('Paris');
    expect(departmentLabel('75')).toBe('75 — Paris');
    expect(departmentLabel('XX')).toBe('XX');
    expect(departmentLabel('')).toBe('');
  });
});
