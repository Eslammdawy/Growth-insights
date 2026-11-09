import { describe, expect, it } from 'vitest';
import {
  chiSquareIndependence,
  chiSquarePValue,
  cosineSimilarity,
  cosineSimilarityMatrix,
} from './stats';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([10, 20], [100, 200])).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(cosineSimilarity([1, 0, 0], [0, 5, 0])).toBeCloseTo(0, 6);
  });

  it('handles zero vectors without NaN', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('computes symmetric cosineSimilarityMatrix with 1 on diagonal', () => {
    const M = [
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const mat = cosineSimilarityMatrix(M);
    expect(mat).toHaveLength(3);
    expect(mat[0][0]).toBe(1);
    expect(mat[1][1]).toBe(1);
    expect(mat[2][2]).toBe(1);
    expect(mat[0][1]).toBeCloseTo(mat[1][0], 6);
    expect(mat[0][2]).toBeCloseTo(0, 6);
    expect(mat[0][1]).toBeCloseTo(1 / Math.sqrt(2), 6);
  });
});

describe('chiSquarePValue', () => {
  it('matches known chi-square values', () => {
    // For df=1, chi2=3.84146 -> p ~ 0.05
    expect(chiSquarePValue(3.84146, 1)).toBeCloseTo(0.05, 2);
    // For df=2, chi2=5.991 -> p ~ 0.05
    expect(chiSquarePValue(5.991, 2)).toBeCloseTo(0.05, 2);
    // For df=10, chi2=18.307 -> p ~ 0.05
    expect(chiSquarePValue(18.307, 10)).toBeCloseTo(0.05, 2);
  });
});

describe('chiSquareIndependence', () => {
  it('returns high p-value for independent matrix', () => {
    // Perfectly proportional rows: row 1 is 1x, row 2 is 2x
    const M = [
      [10, 20, 30],
      [20, 40, 60],
    ];
    const res = chiSquareIndependence(M);
    expect(res.dof).toBe((2 - 1) * (3 - 1));
    expect(res.chi2).toBeCloseTo(0, 5);
    expect(res.pValue).toBeGreaterThan(0.99);
    expect(res.cramersV).toBeCloseTo(0, 5);
  });

  it('returns p ≈ 0 for perfectly dependent matrix', () => {
    // Strongly dependent matrix
    const M = [
      [1000, 0],
      [0, 1000],
    ];
    const res = chiSquareIndependence(M);
    expect(res.dof).toBe(1);
    expect(res.chi2).toBeGreaterThan(100);
    expect(res.pValue).toBeLessThan(0.0001);
    expect(res.cramersV).toBeCloseTo(1, 2);
  });

  it('computes correct dof = (r−1)(c−1)', () => {
    const M = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
    ];
    const res = chiSquareIndependence(M);
    expect(res.dof).toBe((3 - 1) * (4 - 1)); // 2 * 3 = 6
  });

  it('cramersV is in [0, 1]', () => {
    const M = [
      [50, 10, 5],
      [10, 60, 20],
      [5, 15, 80],
    ];
    const res = chiSquareIndependence(M);
    expect(res.cramersV).toBeGreaterThanOrEqual(0);
    expect(res.cramersV).toBeLessThanOrEqual(1);
  });

  it('handles negative or zero cells gracefully', () => {
    const M = [
      [-10, 20],
      [30, -5],
    ];
    const res = chiSquareIndependence(M);
    expect(res.chi2).toBeGreaterThanOrEqual(0);
    expect(isNaN(res.pValue)).toBe(false);
  });
});
