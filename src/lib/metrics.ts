/**
 * Metric definitions: Units and Value, with YoY Growth (Δ = CY − PY), YoY Growth %,
 * Contribution-to-Growth (pp), and Price / Volume / Mix decomposition (Phase 4).
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

/** Realized average price per unit (ΣValue / ΣUnits); null when units are 0. */
export function unitPrice(value: number, units: number): number | null {
  return isZero(units) ? null : value / units;
}

/** Share of total (part / total); null when total is 0. */
export function shareOfTotal(part: number, total: number): number | null {
  return isZero(total) ? null : part / total;
}

/** Contribution to total YoY growth in percentage points: (row Δ / |total PY|) × 100. */
export function contributionPp(delta: number, totalPy: number): number | null {
  return isZero(totalPy) ? null : (delta / Math.abs(totalPy)) * 100;
}

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

// ---------------------------------------------------------------------------------------------
// Phase 4: Price / Volume / Mix & Contribution-to-Growth Decomposition
// ---------------------------------------------------------------------------------------------

export interface PriceVolumeRow {
  pyPrice: number | null;
  cyPrice: number | null;
  priceDelta: number | null;
  /** Volume effect for continuing business: (cyQ − pyQ) × pyPrice. */
  volumeEffect: number;
  /** Price effect for continuing business: cyQ × (cyPrice − pyPrice). */
  priceEffect: number;
  /** Value change from new business (pyQ = 0, cyQ ≠ 0). */
  newEffect: number;
  /** Value change from lost business (pyQ ≠ 0, cyQ = 0). */
  lostEffect: number;
  /** Total value change: cyV − pyV (= volumeEffect + priceEffect + newEffect + lostEffect). */
  totalDeltaV: number;
  /** Percentage-point contributions relative to |totalPyV|. */
  volumePp: number | null;
  pricePp: number | null;
  newLostPp: number | null;
}

/**
 * Decomposes a single entity's Value YoY Δ into Volume, Price, New, and Lost effects.
 * Guarantees the exact identity: `volumeEffect + priceEffect + newEffect + lostEffect === cyV - pyV`.
 */
export function priceVolumeRow(s: Sums, totalPyV?: number): PriceVolumeRow {
  const totalDeltaV = s.cyV - s.pyV;
  const pyPrice = unitPrice(s.pyV, s.pyQ);
  const cyPrice = unitPrice(s.cyV, s.cyQ);
  const priceDelta = pyPrice !== null && cyPrice !== null ? cyPrice - pyPrice : null;

  let volumeEffect = 0;
  let priceEffect = 0;
  let newEffect = 0;
  let lostEffect = 0;

  if (!isZero(s.pyQ) && !isZero(s.cyQ)) {
    const p0 = s.pyV / s.pyQ;
    const p1 = s.cyV / s.cyQ;
    volumeEffect = (s.cyQ - s.pyQ) * p0;
    priceEffect = s.cyQ * (p1 - p0);
  } else if (isZero(s.pyQ) && !isZero(s.cyQ)) {
    newEffect = totalDeltaV;
  } else if (!isZero(s.pyQ) && isZero(s.cyQ)) {
    lostEffect = totalDeltaV;
  } else {
    if (totalDeltaV >= 0) newEffect = totalDeltaV;
    else lostEffect = totalDeltaV;
  }

  const hasTotalPy = totalPyV !== undefined && !isZero(totalPyV);
  return {
    pyPrice,
    cyPrice,
    priceDelta,
    volumeEffect,
    priceEffect,
    newEffect,
    lostEffect,
    totalDeltaV,
    volumePp: hasTotalPy ? contributionPp(volumeEffect, totalPyV!) : null,
    pricePp: hasTotalPy ? contributionPp(priceEffect, totalPyV!) : null,
    newLostPp: hasTotalPy ? contributionPp(newEffect + lostEffect, totalPyV!) : null,
  };
}

export interface PriceVolumeSummary {
  totalPyV: number;
  totalCyV: number;
  totalDeltaV: number;
  totalPyQ: number;
  totalCyQ: number;
  totalDeltaQ: number;
  pyAvgPrice: number | null;
  cyAvgPrice: number | null;
  /** Sum of continuing rows' volume effects: Σ (cyQ_i − pyQ_i) × pyPrice_i. */
  volumeEffect: number;
  /** Portfolio pure volume effect at overall PY average price: Σ_cont (cyQ_i − pyQ_i) × pyAvgPrice. */
  pureVolumeEffect: number;
  /** Mix effect within volume: volumeEffect − pureVolumeEffect = Σ_cont (cyQ_i − pyQ_i) × (pyPrice_i − pyAvgPrice). */
  mixEffect: number;
  /** Sum of continuing rows' price effects: Σ cyQ_i × (cyPrice_i − pyPrice_i). */
  priceEffect: number;
  /** Sum of new rows' value change (pyQ_i = 0). */
  newEffect: number;
  /** Sum of lost rows' value change (cyQ_i = 0). */
  lostEffect: number;
  /** Percentage-point contributions to Total Value Growth % (relative to |totalPyV|). */
  volumePp: number | null;
  pureVolumePp: number | null;
  mixPp: number | null;
  pricePp: number | null;
  newPp: number | null;
  lostPp: number | null;
  totalGrowthPp: number | null;
}

/**
 * Portfolio-level Price / Volume / Mix decomposition across a set of disaggregated rows (e.g. Items or Level rows).
 * Guarantees:
 * - `volumeEffect + priceEffect + newEffect + lostEffect === sum(rows).cyV - sum(rows).pyV`
 * - `pureVolumeEffect + mixEffect === volumeEffect`
 */
export function decomposePriceVolume(rows: Sums[], total?: Sums): PriceVolumeSummary {
  const agg = total ?? rows.reduce((acc, r) => addSums(acc, r), emptySums());
  const pyAvgPrice = unitPrice(agg.pyV, agg.pyQ);
  const cyAvgPrice = unitPrice(agg.cyV, agg.cyQ);
  const totalDeltaV = agg.cyV - agg.pyV;
  const totalDeltaQ = agg.cyQ - agg.pyQ;

  let volumeEffect = 0;
  let pureVolumeEffect = 0;
  let priceEffect = 0;
  let newEffect = 0;
  let lostEffect = 0;

  const list = rows.length > 0 ? rows : [agg];
  for (const s of list) {
    const r = priceVolumeRow(s, agg.pyV);
    volumeEffect += r.volumeEffect;
    priceEffect += r.priceEffect;
    newEffect += r.newEffect;
    lostEffect += r.lostEffect;
    if (!isZero(s.pyQ) && !isZero(s.cyQ) && pyAvgPrice !== null) {
      pureVolumeEffect += (s.cyQ - s.pyQ) * pyAvgPrice;
    }
  }

  const mixEffect = volumeEffect - pureVolumeEffect;

  return {
    totalPyV: agg.pyV,
    totalCyV: agg.cyV,
    totalDeltaV,
    totalPyQ: agg.pyQ,
    totalCyQ: agg.cyQ,
    totalDeltaQ,
    pyAvgPrice,
    cyAvgPrice,
    volumeEffect,
    pureVolumeEffect,
    mixEffect,
    priceEffect,
    newEffect,
    lostEffect,
    volumePp: contributionPp(volumeEffect, agg.pyV),
    pureVolumePp: contributionPp(pureVolumeEffect, agg.pyV),
    mixPp: contributionPp(mixEffect, agg.pyV),
    pricePp: contributionPp(priceEffect, agg.pyV),
    newPp: contributionPp(newEffect, agg.pyV),
    lostPp: contributionPp(lostEffect, agg.pyV),
    totalGrowthPp: contributionPp(totalDeltaV, agg.pyV),
  };
}
