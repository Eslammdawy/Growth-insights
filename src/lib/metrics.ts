/**
 * Metric definitions: Units, Value, PPG (price per pack = ΣValue / ΣUnits), growth and derived columns.
 * All functions are pure and operate on aggregated sums only.
 */
import { EPSILON } from './config';

export type Metric = 'units' | 'value' | 'ppg';
export const METRICS: Metric[] = ['units', 'value', 'ppg'];
export const METRIC_LABEL: Record<Metric, string> = { units: 'Units', value: 'Value', ppg: 'PPG' };

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

/** PPG from aggregated sums; null when units are 0 ("–"). */
export function ppg(value: number, units: number): number | null {
  return isZero(units) ? null : value / units;
}

export type Growth =
  | { kind: 'pct'; value: number }
  | { kind: 'new' } // PY = 0 and CY ≠ 0
  | { kind: 'lost'; value: -1 } // CY = 0 and PY > 0  (−100 %)
  | { kind: 'none' }; // both 0 → "–"

/**
 * Growth % = (CY − PY) / |PY|.
 * PY = 0 & CY ≠ 0 → New; both 0 → "–"; CY = 0 & PY > 0 → −100 % (Lost).
 * `null` (e.g. PPG without units) is treated like 0.
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
export function metricPair(s: Sums, m: Metric): { py: number | null; cy: number | null } {
  if (m === 'units') return { py: s.pyQ, cy: s.cyQ };
  if (m === 'value') return { py: s.pyV, cy: s.cyV };
  return { py: ppg(s.pyV, s.pyQ), cy: ppg(s.cyV, s.cyQ) };
}

export interface MetricCells {
  py: number | null;
  cy: number | null;
  delta: number | null;
  growth: Growth;
  growthNum: number;
  status: GrowthStatus;
}

export function metricCells(s: Sums, m: Metric): MetricCells {
  const { py, cy } = metricPair(s, m);
  let delta: number | null;
  if (m === 'ppg') delta = py === null || cy === null ? null : cy - py;
  else delta = (cy ?? 0) - (py ?? 0);
  const g = growth(py, cy);
  return { py, cy, delta, growth: g, growthNum: growthNumber(g), status: growthStatus(g, m === 'ppg' && delta === null ? (cy ?? 0) - (py ?? 0) : delta) };
}

/** Derived columns of one table row relative to the grand total. */
export interface DerivedRow extends MetricCells {
  /** Units/Value: CY share of total CY. */
  share: number | null;
  /** Units/Value: row Δ / |total PY| × 100 (percentage points). */
  contributionPp: number | null;
  /** PPG: row CY units / total CY units. */
  unitsShare: number | null;
  /** PPG: CY units share × row PPG Δ. */
  priceEffect: number | null;
}

export function deriveRow(s: Sums, total: Sums, m: Metric): DerivedRow {
  const cells = metricCells(s, m);
  const unitsShare = isZero(total.cyQ) ? null : s.cyQ / total.cyQ;
  let share: number | null = null;
  let contributionPp: number | null = null;
  let priceEffect: number | null = null;
  if (m === 'ppg') {
    priceEffect = unitsShare === null || cells.delta === null ? null : unitsShare * cells.delta;
  } else {
    const tot = metricPair(total, m);
    share = isZero(tot.cy) ? null : (cells.cy ?? 0) / (tot.cy as number);
    contributionPp = isZero(tot.py) || cells.delta === null ? null : (cells.delta / Math.abs(tot.py as number)) * 100;
  }
  return { ...cells, share, contributionPp, unitsShare, priceEffect };
}

/**
 * PPG decomposition for the totals row: total PPG Δ = Σ price effects + mix effect.
 * Rows without a PPG in one of the years contribute nothing to price effect (their impact lands in mix).
 */
export function ppgDecomposition(rows: Sums[], total: Sums): { totalDelta: number | null; priceEffect: number; mixEffect: number | null } {
  const t = metricCells(total, 'ppg');
  let price = 0;
  for (const r of rows) {
    const d = deriveRow(r, total, 'ppg');
    if (d.priceEffect !== null) price += d.priceEffect;
  }
  return { totalDelta: t.delta, priceEffect: price, mixEffect: t.delta === null ? null : t.delta - price };
}
