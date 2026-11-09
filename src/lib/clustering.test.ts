import { describe, expect, it } from 'vitest';
import { hierarchicalCluster } from './clustering';

describe('hierarchicalCluster', () => {
  it('handles empty and single-row matrices', () => {
    expect(hierarchicalCluster([])).toEqual([]);
    expect(hierarchicalCluster([[1, 2, 3]])).toEqual([0]);
  });

  it('returns all indices exactly once', () => {
    const M = [
      [10, 0, 5],
      [0, 10, 2],
      [5, 1, 8],
      [0, 8, 3],
    ];
    const order = hierarchicalCluster(M);
    expect(order).toHaveLength(4);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('groups identical rows together', () => {
    // Row 0 and Row 3 are identical
    // Row 1 and Row 2 are identical
    const M = [
      [100, 0, 0], // 0
      [0, 0, 50],  // 1
      [0, 0, 25],  // 2 (same direction as 1)
      [50, 0, 0],  // 3 (same direction as 0)
    ];
    const order = hierarchicalCluster(M);
    // 0 and 3 should be adjacent; 1 and 2 should be adjacent
    const pos0 = order.indexOf(0);
    const pos3 = order.indexOf(3);
    const pos1 = order.indexOf(1);
    const pos2 = order.indexOf(2);

    expect(Math.abs(pos0 - pos3)).toBe(1);
    expect(Math.abs(pos1 - pos2)).toBe(1);
  });
});
