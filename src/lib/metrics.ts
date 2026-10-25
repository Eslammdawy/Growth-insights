/**
 * Metric definitions: Units and Value, with YoY Growth (Δ = CY − PY) and YoY Growth %.
 * All functions are pure and operate on aggregated sums only.
 */
import { EPSILON } from './config';

export type Metric = 'units' | 'value';
export const METRICS: Metric[] = ['units', 'value'];
export const METRIC_LABEL: Record<Metric, string> = { units: 'Units', value: 'Value' };

/** Aggregated sums for one group. q = quantity, v = value. */
export interface Sums {
  pyQ: number;
  pyV: number;
  cyQ: number;
  cyV: number;
}

export const emptySums = (): Sums => ({ pyQ: 0, pyV: 0, cyQ: 0, cyV: 0 });
export function addSums(a: Sums, b: Sums): Sums {
  a.pyQ += b.pyQ;
  a.pyV += b.pyV;
  a.cyQ += b.cyQ;
  a.cyV += b.cyV;
  return a;
}

export const isZero = (x: number | null | undefined) => x === null || x === undefined || Math.abs(x) < EPSILON;

export type Growth =
  | { kind: 'pct'; value: number }
  | { kind: 'new' } // PY = 0 and CY ≠ 0
  | { kind: 'lost'; value: -1 } // CY = 0 and PY > 0  (−100 %)
  | { kind: 'none' }; // both 0 → "–"

/**
 * YoY Growth % = (CY − PY) / |PY|.
 * PY = 0 & CY ≠ 0 → New; both 0 → "–"; CY = 0 & PY > 0 → −100 % (Lost).
 */
export function growth(py: number | null, cy: number | null): Growth {
  const pz = isZero(py);
  const cz = isZero(cy);
  if (pz && cz) return { kind: 'none' };
  if (pz) return { kind: 'new' };
  if (cz && (py as number) > 0) return { kind: 'lost', value: -1 };
  const p = py as number;
  const c = cy ?? 0;
  return { kind: 'pct', value: (c - p) / Math.abs(p) };
}

/** Numeric value of a growth for sorting / charts (New = +∞, "–" = NaN). */
export function growthNumber(g: Growth): number {
  switch (g.kind) {
    case 'pct':
      return g.value;
    case 'lost':
      return -1;
    case 'new':
      return Number.POSITIVE_INFINITY;
    default:
      return Number.NaN;
  }
}

export type GrowthStatus = 'growing' | 'declining' | 'new' | 'lost' | 'flat';

export function growthStatus(g: Growth, delta: number | null): GrowthStatus {
  if (g.kind === 'new') return 'new';
  if (g.kind === 'lost') return 'lost';
  if (g.kind === 'none' || delta === null || isZero(delta)) return 'flat';
  return delta > 0 ? 'growing' : 'declining';
}

/** PY / CY of the given metric. */
export function metricPair(s: Sums, m: Metric): { py: number; cy: number } {
  if (m === 'units') return { py: s.pyQ, cy: s.cyQ };
  return { py: s.pyV, cy: s.cyV };
}

export interface MetricCells {
  py: number;
  cy: number;
  /** YoY Growth (absolute): CY − PY. */
  delta: number;
  /** YoY Growth %. */
  growth: Growth;
  growthNum: number;
  status: GrowthStatus;
}

export function metricCells(s: Sums, m: Metric): MetricCells {
  const { py, cy } = metricPair(s, m);
  const delta = cy - py;
  const g = growth(py, cy);
  return { py, cy, delta, growth: g, growthNum: growthNumber(g), status: growthStatus(g, delta) };
}

/** Table row cells (PY, CY, YoY Growth, YoY Growth %). */
export type DerivedRow = MetricCells;

export function deriveRow(s: Sums, m: Metric): DerivedRow {
  return metricCells(s, m);
}
