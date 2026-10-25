/**
 * Number / growth formatting. All numbers use en-US thousands separators; render with tabular numerals.
 */
import { Growth, Metric } from './metrics';

const DASH = '–';
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf01 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

const clean = (x: number) => (Object.is(x, -0) || Math.abs(x) < 1e-9 ? 0 : x);

export function fmtUnits(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  const v = clean(x);
  return Math.abs(v) >= 1000 ? nf0.format(v) : nf01.format(v);
}

export function fmtValue(x: number | null | undefined, withCurrency = true): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  const s = nf0.format(clean(x));
  return withCurrency ? `EGP ${s}` : s;
}

export function fmtPrice(x: number | null | undefined, withCurrency = true): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  const s = nf2.format(clean(x));
  return withCurrency ? `EGP ${s}` : s;
}

export function fmtSignedPrice(x: number | null | undefined, withCurrency = true): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  const v = clean(x);
  const s = fmtPrice(Math.abs(v), withCurrency);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

export function fmtMetric(x: number | null | undefined, m: Metric, withCurrency = true): string {
  if (m === 'units') return fmtUnits(x);
  return fmtValue(x, withCurrency);
}

export function fmtSigned(x: number | null | undefined, m: Metric, withCurrency = true): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  const v = clean(x);
  const s = fmtMetric(Math.abs(v), m, withCurrency);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

export function fmtCompact(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  return compact.format(clean(x));
}

export function fmtPct(x: number | null | undefined, signed = false): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  const v = clean(x) * 100;
  const s = `${nf1.format(Math.abs(v))}%`;
  if (v < 0) return `−${s}`;
  return signed && v > 0 ? `+${s}` : s;
}

export function fmtPp(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  const v = clean(x);
  const s = `${nf2.format(Math.abs(v))} pp`;
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

/** "New", "−100.0%", "–" or a signed percentage. */
export function fmtGrowth(g: Growth): string {
  switch (g.kind) {
    case 'new':
      return 'New';
    case 'none':
      return DASH;
    case 'lost':
      return '−100.0%';
    default:
      return fmtPct(g.value, true);
  }
}

export function metricUnitLabel(m: Metric): string {
  return m === 'units' ? 'Units' : 'Value (EGP)';
}
