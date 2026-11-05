/**
 * Metric definitions: Units and Value, with YoY Growth (Δ = CY − PY), YoY Growth %,
 * Contribution-to-Growth (pp), and Price / Volume / Mix decomposition (Phase 4).
 * All functions are pure and operate on aggregated sums only.
 */
import { EPSILON, GROWTH_BAND, RETURNS_FLAG_FACTOR, RETURNS_MIN_GROSS } from './config';

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

// ---------------------------------------------------------------------------------------------
// WI-4: Customer Lifecycle Segments & Retention Metrics
// ---------------------------------------------------------------------------------------------

export type CustomerSegment = 'new' | 'growing' | 'stable' | 'declining' | 'lost';
export const CUSTOMER_SEGMENTS: CustomerSegment[] = ['new', 'growing', 'stable', 'declining', 'lost'];

export const CUSTOMER_SEGMENT_LABEL: Record<CustomerSegment, string> = {
  new: 'New',
  growing: 'Growing',
  stable: 'Stable (±5%)',
  declining: 'Declining',
  lost: 'Lost (−100%)',
};

export interface CustomerSegmentStats {
  count: number;
  sums: Sums;
}

export interface CustomerInsightsByMetric {
  segments: Record<CustomerSegment, CustomerSegmentStats>;
  active: { pyCount: number; cyCount: number; bothCount: number; totalCount: number };
  nrr: number | null;
  grr: number | null;
  churnRate: number | null;
  contractionRate: number | null;
  expansionRate: number | null;
  newRate: number | null;
  retainedGrowthShare: number | null;
  newGrowthShare: number | null;
  retainedDelta: number;
  newDelta: number;
  avgPerActive: { py: number | null; cy: number | null };
}

export interface CustomerInsights extends CustomerInsightsByMetric {
  byMetric: Record<Metric, CustomerInsightsByMetric>;
}

/**
 * Classifies a customer's Sums into one of the 5 lifecycle segments on the given metric basis:
 * - New: PY = 0, CY ≠ 0
 * - Lost: PY ≠ 0, CY = 0
 * - Growing: PY ≠ 0, CY ≠ 0, (CY − PY) / |PY| > GROWTH_BAND (+5%)
 * - Declining: PY ≠ 0, CY ≠ 0, (CY − PY) / |PY| < −GROWTH_BAND (−5%)
 * - Stable: |(CY − PY) / |PY|| ≤ GROWTH_BAND (including 0 → 0)
 */
export function classifyCustomerSegment(sums: Sums, metric: Metric): CustomerSegment {
  const { py, cy } = metricPair(sums, metric);
  const pyZ = isZero(py);
  const cyZ = isZero(cy);
  if (pyZ && !cyZ) return 'new';
  if (!pyZ && cyZ) return 'lost';
  if (pyZ && cyZ) return 'stable';
  const rel = (cy - py) / Math.abs(py);
  if (rel > GROWTH_BAND) return 'growing';
  if (rel < -GROWTH_BAND) return 'declining';
  return 'stable';
}

export function computeCustomerInsightsForMetric(
  customerRows: { sums: Sums }[],
  metric: Metric,
): CustomerInsightsByMetric {
  const segments: Record<CustomerSegment, CustomerSegmentStats> = {
    new: { count: 0, sums: emptySums() },
    growing: { count: 0, sums: emptySums() },
    stable: { count: 0, sums: emptySums() },
    declining: { count: 0, sums: emptySums() },
    lost: { count: 0, sums: emptySums() },
  };

  let pyCount = 0;
  let cyCount = 0;
  let bothCount = 0;

  let retainedPy = 0;
  let retainedCy = 0;
  let expansion = 0;
  let contraction = 0; // negative or 0
  let lostPy = 0;
  let newCy = 0;
  let totalPy = 0;
  let totalCy = 0;

  for (const r of customerRows) {
    const seg = classifyCustomerSegment(r.sums, metric);
    segments[seg].count++;
    addSums(segments[seg].sums, r.sums);

    const { py, cy } = metricPair(r.sums, metric);
    totalPy += py;
    totalCy += cy;

    const pyActive = !isZero(py) && py > 0;
    const cyActive = !isZero(cy) && cy > 0;
    if (pyActive) pyCount++;
    if (cyActive) cyCount++;
    if (pyActive && cyActive) bothCount++;

    const pyNonZero = !isZero(py);
    const cyNonZero = !isZero(cy);
    if (pyNonZero && cyNonZero) {
      retainedPy += py;
      retainedCy += cy;
      const d = cy - py;
      if (d > 0) expansion += d;
      else contraction += d;
    } else if (pyNonZero && !cyNonZero) {
      lostPy += py;
    } else if (!pyNonZero && cyNonZero) {
      newCy += cy;
    }
  }

  const pyActiveBase = retainedPy + lostPy;
  const hasPyBase = !isZero(pyActiveBase);
  const absPyBase = Math.abs(pyActiveBase);

  const nrr = hasPyBase ? retainedCy / absPyBase : null;
  const grr = hasPyBase ? (retainedPy + contraction) / absPyBase : null;
  const churnRate = hasPyBase ? lostPy / absPyBase : null;
  const contractionRate = hasPyBase ? -contraction / absPyBase : null;
  const expansionRate = hasPyBase ? expansion / absPyBase : null;
  const newRate = hasPyBase ? newCy / absPyBase : null;

  const retainedGrowthShare = nrr !== null ? nrr - 1 : null;
  const newGrowthShare = newRate;
  const retainedDelta = retainedCy - pyActiveBase;
  const newDelta = newCy;

  return {
    segments,
    active: {
      pyCount,
      cyCount,
      bothCount,
      totalCount: customerRows.length,
    },
    nrr,
    grr,
    churnRate,
    contractionRate,
    expansionRate,
    newRate,
    retainedGrowthShare,
    newGrowthShare,
    retainedDelta,
    newDelta,
    avgPerActive: {
      py: pyCount > 0 ? totalPy / pyCount : null,
      cy: cyCount > 0 ? totalCy / cyCount : null,
    },
  };
}

export function computeCustomerInsights(customerRows: { sums: Sums }[]): CustomerInsights {
  const byValue = computeCustomerInsightsForMetric(customerRows, 'value');
  const byUnits = computeCustomerInsightsForMetric(customerRows, 'units');
  return {
    ...byValue,
    byMetric: {
      value: byValue,
      units: byUnits,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// WI-5: Gross vs. Returns & Returns-Rate Helpers
// ---------------------------------------------------------------------------------------------

/** Derives Return Sales sums from Net and Gross (`returns = net − gross`, so `gross + returns === net`). */
export function deriveReturnsSums(net: Sums, gross: Sums): Sums {
  return {
    pyQ: net.pyQ - gross.pyQ,
    pyV: net.pyV - gross.pyV,
    cyQ: net.cyQ - gross.cyQ,
    cyV: net.cyV - gross.cyV,
  };
}

/**
 * Returns Rate in percentage (`(−Returns) / Gross × 100`).
 * Returns `null` when `Gross ≤ 0`.
 */
export function returnsRatePct(netVal: number, grossVal: number): number | null {
  if (isZero(grossVal) || grossVal <= 0) return null;
  const returnsVal = netVal - grossVal; // negative when returns occurred
  const rate = (-returnsVal / grossVal) * 100;
  return Object.is(rate, -0) || Math.abs(rate) < 1e-9 ? 0 : rate;
}

/**
 * Flags a row when its CY Returns Rate exceeds `RETURNS_FLAG_FACTOR × portfolioRatePct`
 * AND its CY Gross Value meets the `RETURNS_MIN_GROSS` (10,000 EGP) floor.
 */
export function isReturnsFlagged(
  rowNetCyV: number,
  rowGrossCyV: number,
  portfolioRatePct: number | null,
): boolean {
  if (portfolioRatePct === null || portfolioRatePct <= 0) return false;
  if ( rowGrossCyV < RETURNS_MIN_GROSS) return false;
  const rowRate = returnsRatePct(rowNetCyV, rowGrossCyV);
  if (rowRate === null) return false;
  return rowRate > RETURNS_FLAG_FACTOR * portfolioRatePct;
}

// ---------------------------------------------------------------------------------------------
// Product × Customer-Segment Exposure & Customer-Behavior Growth Decomposition
// ---------------------------------------------------------------------------------------------

export type ProductExposureLevel = 'item' | 'brand' | 'line';
export const PRODUCT_EXPOSURE_LEVELS: ProductExposureLevel[] = ['item', 'brand', 'line'];
export const PRODUCT_EXPOSURE_LEVEL_LABEL: Record<ProductExposureLevel, string> = {
  item: 'Item',
  brand: 'Brand',
  line: 'Line',
};

export interface CustomerBehaviorRow {
  /** Sales from customers with PY = 0, CY ≠ 0 for this product. */
  newCustomerEffect: number;
  /** Positive Δ from retained customers (PY ≠ 0, CY ≠ 0) who increased purchases of this product. */
  expansionEffect: number;
  /** Negative (or 0) Δ from retained customers (PY ≠ 0, CY ≠ 0) who decreased purchases of this product. */
  contractionEffect: number;
  /** Negative (or 0) Δ from customers with PY ≠ 0, CY = 0 for this product. */
  lostCustomerEffect: number;
  /** Exact sum: newCustomerEffect + expansionEffect + contractionEffect + lostCustomerEffect === cy − py. */
  totalDelta: number;
  newPp: number | null;
  expansionPp: number | null;
  contractionPp: number | null;
  lostPp: number | null;
}

/**
 * Decomposes a product's YoY Δ across per-customer pairs into:
 * `newCustomerEffect + expansionEffect + contractionEffect + lostCustomerEffect === totalDelta`.
 */
export function decomposeCustomerBehavior(
  perCustomer: { customerId?: string; pyQ: number; pyV: number; cyQ: number; cyV: number }[],
  totalPy: number,
  metric: Metric = 'value',
): CustomerBehaviorRow {
  let newCustomerEffect = 0;
  let expansionEffect = 0;
  let contractionEffect = 0;
  let lostCustomerEffect = 0;

  for (const c of perCustomer) {
    const py = metric === 'units' ? c.pyQ : c.pyV;
    const cy = metric === 'units' ? c.cyQ : c.cyV;
    const pyZ = isZero(py);
    const cyZ = isZero(cy);
    if (pyZ && cyZ) continue;
    if (pyZ && !cyZ) {
      newCustomerEffect += cy - py;
    } else if (!pyZ && cyZ) {
      lostCustomerEffect += cy - py;
    } else {
      const d = cy - py;
      if (d > 0) expansionEffect += d;
      else contractionEffect += d;
    }
  }

  const totalDelta = newCustomerEffect + expansionEffect + contractionEffect + lostCustomerEffect;
  const hasPy = !isZero(totalPy);

  return {
    newCustomerEffect,
    expansionEffect,
    contractionEffect,
    lostCustomerEffect,
    totalDelta,
    newPp: hasPy ? contributionPp(newCustomerEffect, totalPy) : null,
    expansionPp: hasPy ? contributionPp(expansionEffect, totalPy) : null,
    contractionPp: hasPy ? contributionPp(contractionEffect, totalPy) : null,
    lostPp: hasPy ? contributionPp(lostCustomerEffect, totalPy) : null,
  };
}

/**
 * Sums item-level CustomerBehaviorRow effects into a parent (Brand or Line) CustomerBehaviorRow,
 * preserving the exact identity `new + expansion + contraction + lost === totalDelta`.
 */
export function mergeCustomerBehaviorRows(
  rows: CustomerBehaviorRow[],
  parentPy: number,
): CustomerBehaviorRow {
  let newCustomerEffect = 0;
  let expansionEffect = 0;
  let contractionEffect = 0;
  let lostCustomerEffect = 0;
  for (const r of rows) {
    newCustomerEffect += r.newCustomerEffect;
    expansionEffect += r.expansionEffect;
    contractionEffect += r.contractionEffect;
    lostCustomerEffect += r.lostCustomerEffect;
  }
  const totalDelta = newCustomerEffect + expansionEffect + contractionEffect + lostCustomerEffect;
  const hasPy = !isZero(parentPy);
  return {
    newCustomerEffect,
    expansionEffect,
    contractionEffect,
    lostCustomerEffect,
    totalDelta,
    newPp: hasPy ? contributionPp(newCustomerEffect, parentPy) : null,
    expansionPp: hasPy ? contributionPp(expansionEffect, parentPy) : null,
    contractionPp: hasPy ? contributionPp(contractionEffect, parentPy) : null,
    lostPp: hasPy ? contributionPp(lostCustomerEffect, parentPy) : null,
  };
}

export interface ProductSegmentBreakdown {
  itemId: string;
  itemLabel: string;
  level: ProductExposureLevel;
  brand?: string;
  line?: string;
  /** 5-segment sums bucketed by each customer's overall lifecycle segment. */
  segments: Record<CustomerSegment, Sums>;
  /** Product PY / CY totals (reconciles with Σ segments). */
  totals: Sums;
  /** Signed percentage-point contribution of each customer segment to the product's YoY % (segment Δ ÷ |product PY| × 100). */
  newAcquisitionPp: number | null;
  expansionPp: number | null;
  stablePp: number | null;
  contractionExposurePp: number | null;
  churnExposurePp: number | null;
  /** Enhancement 2: per-product customer-behavior decomposition (PY → +New → +Expansion → −Contraction → −Lost → CY). */
  customerBehavior: CustomerBehaviorRow;
}

export interface ProductExposureByMetric {
  byLevel: Record<ProductExposureLevel, ProductSegmentBreakdown[]>;
}

export interface ProductExposure extends ProductExposureByMetric {
  byMetric: Record<Metric, ProductExposureByMetric>;
}

export function buildProductSegmentBreakdown(params: {
  itemId: string;
  itemLabel: string;
  level: ProductExposureLevel;
  brand?: string;
  line?: string;
  segments: Record<CustomerSegment, Sums>;
  totals: Sums;
  customerBehavior: CustomerBehaviorRow;
  metric: Metric;
}): ProductSegmentBreakdown {
  const { itemId, itemLabel, level, brand, line, segments, totals, customerBehavior, metric } = params;
  const { py } = metricPair(totals, metric);
  const segDelta = (seg: CustomerSegment) => {
    const p = metricPair(segments[seg], metric);
    return p.cy - p.py;
  };
  return {
    itemId,
    itemLabel,
    level,
    brand,
    line,
    segments,
    totals,
    newAcquisitionPp: contributionPp(segDelta('new'), py),
    expansionPp: contributionPp(segDelta('growing'), py),
    stablePp: contributionPp(segDelta('stable'), py),
    contractionExposurePp: contributionPp(segDelta('declining'), py),
    churnExposurePp: contributionPp(segDelta('lost'), py),
    customerBehavior,
  };
}

export interface ProductBehaviorWaterfallStep {
  id: 'py' | 'new' | 'expansion' | 'contraction' | 'lost' | 'cy';
  label: string;
  shortLabel: string;
  kind: 'py' | 'pos' | 'neg' | 'cy';
  start: number;
  end: number;
  spacer: number;
  span: number;
  delta: number;
  pp: number | null;
}

/**
 * Builds the 6-row bridge waterfall (`PY → +New → +Expansion → −Contraction → −Lost → CY`)
 * for a single product's CustomerBehaviorRow.
 * Guarantees `PY + newCustomerEffect + expansionEffect + contractionEffect + lostCustomerEffect === CY`.
 */
export function buildProductBehaviorWaterfall(
  totals: Sums,
  cb: CustomerBehaviorRow,
  metric: Metric,
  period: { pyLabel: string; cyLabel: string },
): ProductBehaviorWaterfallStep[] {
  const { py, cy } = metricPair(totals, metric);
  const totalDelta = cy - py;
  const steps: ProductBehaviorWaterfallStep[] = [];

  steps.push({
    id: 'py',
    label: `PY (${period.pyLabel})`,
    shortLabel: `PY (${period.pyLabel})`,
    kind: 'py',
    start: 0,
    end: py,
    spacer: Math.min(0, py),
    span: Math.abs(py),
    delta: py,
    pp: null,
  });

  let running = py;
  const pushEffect = (
    id: 'new' | 'expansion' | 'contraction' | 'lost',
    label: string,
    kind: 'pos' | 'neg',
    delta: number,
    pp: number | null,
  ) => {
    const start = running;
    const end = running + delta;
    running = end;
    steps.push({
      id,
      label,
      shortLabel: label,
      kind,
      start,
      end,
      spacer: Math.min(start, end),
      span: Math.abs(delta),
      delta,
      pp,
    });
  };

  pushEffect('new', '+New Customers', 'pos', cb.newCustomerEffect, cb.newPp);
  pushEffect('expansion', '+Expansion (Retained)', 'pos', cb.expansionEffect, cb.expansionPp);
  pushEffect('contraction', '−Contraction (Retained)', 'neg', cb.contractionEffect, cb.contractionPp);
  pushEffect('lost', '−Lost Customers', 'neg', cb.lostCustomerEffect, cb.lostPp);

  steps.push({
    id: 'cy',
    label: `CY (${period.cyLabel})`,
    shortLabel: `CY (${period.cyLabel})`,
    kind: 'cy',
    start: 0,
    end: cy,
    spacer: Math.min(0, cy),
    span: Math.abs(cy),
    delta: cy,
    pp: contributionPp(totalDelta, py),
  });

  return steps;
}



