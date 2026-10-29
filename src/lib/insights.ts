/**
 * Pure helper functions for the "Growth Drivers" story section (WI-1 & WI-3):
 * - Template-based headline builder (no LLM)
 * - Additive contribution waterfall builder
 * - Growth concentration & single-entity dominance metrics
 */
import { WATERFALL_TOP_N } from './config';
import { ContributionRow, DrillField, InsightLevel } from './aggregate';
import { fmtCompact, fmtGrowth, fmtMetric, fmtPp, fmtSigned } from './format';
import {
   METRIC_LABEL,
  Metric,
  Sums,
  contributionPp,
  deriveRow,
  isZero,
} from './metrics';

export const DRIVER_LEVELS: InsightLevel[] = ['subtype', 'distributor', 'territory', 'item'];

export const DRIVER_LEVEL_LABEL: Record<InsightLevel, string> = {
  subtype: 'SubType',
  distributor: 'Distributor',
  territory: 'Territory',
  brick: 'Brick',
  item: 'Item',
};

export interface DriverCandidate {
  label: string;
  delta: number;
  pp: number | null;
}

export interface HeadlinePeriod {
  pyLabel: string;
  cyLabel: string;
}

export type HeadlineCase = 'empty' | 'new-only' | 'lost-only' | 'flat' | 'growth' | 'decline';

export interface HeadlineResult {
  kind: HeadlineCase;
  text: string;
}

/**
 * Pure template-based headline generator for the Growth Drivers banner.
 * Handles 6 distinct cases: growth, decline, flat, new-only, lost-only, and empty.
 */
export function buildHeadline(
  metric: Metric,
  totals: Sums,
  topContrib: DriverCandidate | null | undefined,
  topDetractor: DriverCandidate | null | undefined,
  period: HeadlinePeriod,
): HeadlineResult {
  const mLabel = METRIC_LABEL[metric];
  const d = deriveRow(totals, metric);
  const pyZero = isZero(d.py);
  const cyZero = isZero(d.cy);
  const deltaZero = isZero(d.delta);

  const hasPos = Boolean(topContrib && topContrib.delta > 0 && !isZero(topContrib.delta));
  const hasNeg = Boolean(topDetractor && topDetractor.delta < 0 && !isZero(topDetractor.delta));

  const fmtDriver = (cand: DriverCandidate) => {
    if (cand.pp !== null && Number.isFinite(cand.pp)) {
      return `${cand.label} (${fmtPp(cand.pp)})`;
    }
    const unitSuffix = metric === 'value' ? ' EGP' : ' units';
    return `${cand.label} (${cand.delta >= 0 ? '+' : '−'}${fmtCompact(Math.abs(cand.delta))}${unitSuffix})`;
  };

  // 1. Empty (both PY and CY are zero)
  if (pyZero && cyZero) {
    return {
      kind: 'empty',
      text: `No ${mLabel.toLowerCase()} activity in ${period.cyLabel} vs ${period.pyLabel} for the current filter selection.`,
    };
  }

  // 2. All-new portfolio (PY = 0, CY ≠ 0)
  if (pyZero && !cyZero) {
    const cyFormatted = fmtMetric(d.cy, metric);
    const driverPart = hasPos ? ` Top driver: ${fmtDriver(topContrib!)}.` : '';
    return {
      kind: 'new-only',
      text: `${mLabel} generated ${cyFormatted} as all-new business in ${period.cyLabel} (0 in ${period.pyLabel}).${driverPart}`,
    };
  }

  // 3. Lost-only portfolio (PY > 0, CY = 0)
  if (!pyZero && cyZero && d.py > 0) {
    const deltaFormatted = fmtSigned(d.delta, metric);
    const detractorPart = hasNeg ? ` Top detractor: ${fmtDriver(topDetractor!)}.` : '';
    return {
      kind: 'lost-only',
      text: `${mLabel} declined −100.0% (${deltaFormatted}) in ${period.cyLabel} vs ${period.pyLabel} with no active CY sales.${detractorPart}`,
    };
  }

  // 4. Flat portfolio (Δ ≈ 0)
  if (deltaZero) {
    const cyFormatted = fmtMetric(d.cy, metric);
    if (hasPos && hasNeg) {
      return {
        kind: 'flat',
        text: `${mLabel} held flat at ${cyFormatted} (0.0%) in ${period.cyLabel} vs ${period.pyLabel}. Top driver: ${fmtDriver(topContrib!)}; offset by top detractor: ${fmtDriver(topDetractor!)}.`,
      };
    }
    return {
      kind: 'flat',
      text: `${mLabel} held flat at ${cyFormatted} (0.0%) in ${period.cyLabel} vs ${period.pyLabel}.`,
    };
  }

  // 5 & 6. Growth or Decline
  const isGrowth = d.delta > 0;
  const verb = isGrowth ? 'grew' : 'declined';
  const gStr = fmtGrowth(d.growth);
  const absCompact = fmtCompact(Math.abs(d.delta));
  const signedCompact = `${d.delta >= 0 ? '+' : '−'}${absCompact}${metric === 'value' ? ' EGP' : ' units'}`;

  let driverTail = '';
  if (hasPos && hasNeg) {
    driverTail = ` Top driver: ${fmtDriver(topContrib!)}; top detractor: ${fmtDriver(topDetractor!)}.`;
  } else if (hasPos) {
    driverTail = ` Top driver: ${fmtDriver(topContrib!)} (no detractors).`;
  } else if (hasNeg) {
    driverTail = ` Top detractor: ${fmtDriver(topDetractor!)} (no positive contributors).`;
  }

  return {
    kind: isGrowth ? 'growth' : 'decline',
    text: `${mLabel} ${verb} ${gStr} (${signedCompact}) in ${period.cyLabel} vs ${period.pyLabel}.${driverTail}`,
  };
}

export type WaterfallStepKind = 'py' | 'pos' | 'other-pos' | 'neg' | 'other-neg' | 'cy';

export interface WaterfallStep {
  id: string;
  label: string;
  shortLabel: string;
  kind: WaterfallStepKind;
  /** Start of the bar along the metric axis. */
  start: number;
  /** End of the bar along the metric axis. */
  end: number;
  /** Invisible base offset for stacked-bar rendering (min(start, end)). */
  spacer: number;
  /** Visible bar length (|end - start|). */
  span: number;
  /** Signed change (or total for PY/CY endpoints). */
  delta: number;
  /** Contribution in percentage points relative to |PY_total| (or total YoY % for CY bar). */
  pp: number | null;
  /** Drill target when the step represents a single entity. */
  drill?: { field: DrillField; value: string; label: string };
}

function truncateLabel(s: string, max = 22): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * Builds an additive bridge waterfall from `PY_total` to `CY_total`:
 * `PY total` -> top N positive-Δ entities -> "Other growth" -> top N negative-Δ entities -> "Other decline" -> `CY total`.
 * Guarantees `PY_total + Σ(step deltas) === CY_total`.
 */
export function buildWaterfall(
  rows: ContributionRow[],
  totals: Sums,
  metric: Metric,
  period: HeadlinePeriod,
  topN: number = WATERFALL_TOP_N,
): WaterfallStep[] {
  const pyTotal = metric === 'units' ? totals.pyQ : totals.pyV;
  const cyTotal = metric === 'units' ? totals.cyQ : totals.cyV;
  const totalDelta = cyTotal - pyTotal;

  const getDelta = (r: ContributionRow) => (metric === 'units' ? r.unitsDelta : r.valueDelta);

  const posRows = rows
    .filter((r) => getDelta(r) > 0 && !isZero(getDelta(r)))
    .sort((a, b) => getDelta(b) - getDelta(a));

  const negRows = rows
    .filter((r) => getDelta(r) < 0 && !isZero(getDelta(r)))
    .sort((a, b) => getDelta(a) - getDelta(b)); // most negative first

  const topPos = posRows.slice(0, topN);
  const restPos = posRows.slice(topN);
  let otherPosDelta = restPos.reduce((acc, r) => acc + getDelta(r), 0);
  let otherPosCount = restPos.length;

  const topNeg = negRows.slice(0, topN);
  const restNeg = negRows.slice(topN);
  let otherNegDelta = restNeg.reduce((acc, r) => acc + getDelta(r), 0);
  let otherNegCount = restNeg.length;

  // Absorb any unattributed level residual (e.g., excluded distributor Ezaby) so PY + ΣΔ === CY holds strictly
  const sumRowDeltas = rows.reduce((acc, r) => acc + getDelta(r), 0);
  const residual = totalDelta - sumRowDeltas;
  if (!isZero(residual)) {
    if (residual > 0) {
      otherPosDelta += residual;
      if (otherPosCount === 0) otherPosCount = 1;
    } else {
      otherNegDelta += residual;
      if (otherNegCount === 0) otherNegCount = 1;
    }
  }

  const steps: WaterfallStep[] = [];

  // 1. PY Total
  steps.push({
    id: '__py_total__',
    label: `PY (${period.pyLabel})`,
    shortLabel: `PY (${period.pyLabel})`,
    kind: 'py',
    start: 0,
    end: pyTotal,
    spacer: Math.min(0, pyTotal),
    span: Math.abs(pyTotal),
    delta: pyTotal,
    pp: null,
  });

  let running = pyTotal;

  const pushDeltaStep = (
    id: string,
    label: string,
    kind: WaterfallStepKind,
    delta: number,
    drill?: { field: DrillField; value: string; label: string },
  ) => {
    const start = running;
    const end = running + delta;
    running = end;
    steps.push({
      id,
      label,
      shortLabel: truncateLabel(label),
      kind,
      start,
      end,
      spacer: Math.min(start, end),
      span: Math.abs(delta),
      delta,
      pp: contributionPp(delta, pyTotal),
      drill,
    });
  };

  // 2. Top N positive contributors
  for (const r of topPos) {
    const delta = getDelta(r);
    pushDeltaStep(r.id, r.label, 'pos', delta, {
      field: r.field as DrillField,
      value: r.value,
      label: r.label,
    });
  }

  // 3. Other growth remainder
  if (!isZero(otherPosDelta)) {
    pushDeltaStep(
      '__other_pos__',
      restPos.length > 0 ? `Other growth (+${restPos.length})` : 'Other / unattributed growth',
      'other-pos',
      otherPosDelta,
    );
  }

  // 4. Top N negative detractors (most negative first)
  for (const r of topNeg) {
    const delta = getDelta(r);
    pushDeltaStep(r.id, r.label, 'neg', delta, {
      field: r.field as DrillField,
      value: r.value,
      label: r.label,
    });
  }

  // 5. Other decline remainder
  if (!isZero(otherNegDelta)) {
    pushDeltaStep(
      '__other_neg__',
      restNeg.length > 0 ? `Other decline (${restNeg.length})` : 'Other / unattributed decline',
      'other-neg',
      otherNegDelta,
    );
  }

  // 6. CY Total
  steps.push({
    id: '__cy_total__',
    label: `CY (${period.cyLabel})`,
    shortLabel: `CY (${period.cyLabel})`,
    kind: 'cy',
    start: 0,
    end: cyTotal,
    spacer: Math.min(0, cyTotal),
    span: Math.abs(cyTotal),
    delta: cyTotal,
    pp: contributionPp(totalDelta, pyTotal),
  });

  if (typeof console !== 'undefined' && typeof console.assert === 'function') {
    const sumDeltas = steps
      .filter((s) => s.kind !== 'py' && s.kind !== 'cy')
      .reduce((acc, s) => acc + s.delta, 0);
    console.assert(
      Math.abs(pyTotal + sumDeltas - cyTotal) <= 1e-4,
      `Waterfall reconciliation failed: PY (${pyTotal}) + ΣΔ (${sumDeltas}) !== CY (${cyTotal})`,
    );
  }

  return steps;
}

export interface RankedDrivers {
  contributors: ContributionRow[];
  detractors: ContributionRow[];
}

/**
 * Extracts ranked positive contributors (descending) and negative detractors (most negative first).
 */
export function rankDrivers(rows: ContributionRow[], metric: Metric, limit = 5): RankedDrivers {
  const getDelta = (r: ContributionRow) => (metric === 'units' ? r.unitsDelta : r.valueDelta);
  const contributors = rows
    .filter((r) => getDelta(r) > 0 && !isZero(getDelta(r)))
    .sort((a, b) => getDelta(b) - getDelta(a))
    .slice(0, limit);
  const detractors = rows
    .filter((r) => getDelta(r) < 0 && !isZero(getDelta(r)))
    .sort((a, b) => getDelta(a) - getDelta(b))
    .slice(0, limit);
  return { contributors, detractors };
}

export interface GrowthConcentration {
  topPosShare1: number | null;
  topPosShare5: number | null;
  topNegShare1: number | null;
  topNegShare5: number | null;
  dominance: boolean;
  topPosLabel: string | null;
  topNegLabel: string | null;
  posCount: number;
  negCount: number;
}

/**
 * WI-3: Computes growth concentration shares over positive and negative bridge deltas.
 * `topPosShare_N = Σ top-N positive Δ / Σ all positive Δ`
 * `topNegShare_N = Σ top-N |negative Δ| / Σ all |negative Δ|`
 * `dominance = max(Δ_i) / Σ positive Δ > 0.5`
 */
export function growthConcentration(
  rows: ContributionRow[],
  metric: Metric = 'value',
): GrowthConcentration {
  const getDelta = (r: ContributionRow) => (metric === 'units' ? r.unitsDelta : r.valueDelta);

  const posRows = rows
    .filter((r) => getDelta(r) > 0 && !isZero(getDelta(r)))
    .sort((a, b) => getDelta(b) - getDelta(a));

  const negRows = rows
    .filter((r) => getDelta(r) < 0 && !isZero(getDelta(r)))
    .sort((a, b) => getDelta(a) - getDelta(b));

  const totalPos = posRows.reduce((acc, r) => acc + getDelta(r), 0);
  const totalNegAbs = negRows.reduce((acc, r) => acc + Math.abs(getDelta(r)), 0);

  const topPosShare1 =
    !isZero(totalPos) && posRows.length > 0 ? getDelta(posRows[0]) / totalPos : null;
  const topPosShare5 =
    !isZero(totalPos) && posRows.length > 0
      ? posRows.slice(0, 5).reduce((acc, r) => acc + getDelta(r), 0) / totalPos
      : null;

  const topNegShare1 =
    !isZero(totalNegAbs) && negRows.length > 0
      ? Math.abs(getDelta(negRows[0])) / totalNegAbs
      : null;
  const topNegShare5 =
    !isZero(totalNegAbs) && negRows.length > 0
      ? negRows.slice(0, 5).reduce((acc, r) => acc + Math.abs(getDelta(r)), 0) / totalNegAbs
      : null;

  const dominance = topPosShare1 !== null && topPosShare1 > 0.5;

  return {
    topPosShare1,
    topPosShare5,
    topNegShare1,
    topNegShare5,
    dominance,
    topPosLabel: posRows[0]?.label ?? null,
    topNegLabel: negRows[0]?.label ?? null,
    posCount: posRows.length,
    negCount: negRows.length,
  };
}
