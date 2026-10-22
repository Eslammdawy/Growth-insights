/**
 * Period logic: years / quarters / months derived from the numeric YYYYMM `Date` column.
 */

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const yearOf = (yyyymm: number) => Math.floor(yyyymm / 100);
export const monthOf = (yyyymm: number) => yyyymm % 100;
export const quarterOfMonth = (month: number) => Math.ceil(month / 3);
export const quarterMonths = (q: number) => [3 * q - 2, 3 * q - 1, 3 * q];
export const yy = (year: number) => String(year % 100).padStart(2, '0');

/** Months (1..12) available per year. */
export interface PeriodAvailability {
  years: number[]; // ascending
  monthsByYear: Record<number, number[]>; // ascending months
}

export function availabilityFromPeriods(periods: Iterable<number>): PeriodAvailability {
  const by: Record<number, Set<number>> = {};
  for (const p of periods) {
    if (!Number.isFinite(p)) continue;
    const y = yearOf(p);
    (by[y] ??= new Set()).add(monthOf(p));
  }
  const years = Object.keys(by)
    .map(Number)
    .sort((a, b) => a - b);
  const monthsByYear: Record<number, number[]> = {};
  for (const y of years) monthsByYear[y] = [...by[y]].sort((a, b) => a - b);
  return { years, monthsByYear };
}

export interface PeriodSelection {
  cyYear: number;
  pyYear: number;
  quarter: number; // 1..4
  month: number | null; // optional single month within the quarter
  likeForLike: boolean;
}

/** Default selection: latest year = CY, prior year = PY, latest quarter that has CY data. */
export function defaultSelection(av: PeriodAvailability): PeriodSelection {
  const cyYear = av.years[av.years.length - 1] ?? new Date().getFullYear();
  const months = av.monthsByYear[cyYear] ?? [];
  const lastMonth = months[months.length - 1] ?? 1;
  return { cyYear, pyYear: cyYear - 1, quarter: quarterOfMonth(lastMonth), month: null, likeForLike: true };
}

export interface ResolvedPeriod {
  cyPeriods: number[]; // YYYYMM values included in CY
  pyPeriods: number[]; // YYYYMM values included in PY
  cyMonths: number[];
  pyMonths: number[];
  /** Months of the comparison shown on the month chart (union, ascending). */
  chartMonths: number[];
  complete: boolean; // CY has all months of the selection
  banner: string;
  cyLabel: string;
  pyLabel: string;
}

function monthsLabel(months: number[], year: number): string {
  if (!months.length) return `– ${yy(year)}`;
  if (months.length === 1) return `${MONTH_ABBR[months[0] - 1]}-${yy(year)}`;
  return `${MONTH_ABBR[months[0] - 1]}–${MONTH_ABBR[months[months.length - 1] - 1]}-${yy(year)}`;
}

export function resolvePeriod(av: PeriodAvailability, sel: PeriodSelection): ResolvedPeriod {
  const wanted = sel.month ? [sel.month] : quarterMonths(sel.quarter);
  const cyAvail = new Set(av.monthsByYear[sel.cyYear] ?? []);
  const cyMonths = wanted.filter((m) => cyAvail.has(m));
  const complete = cyMonths.length === wanted.length;
  const pyMonths = sel.likeForLike ? cyMonths : wanted;
  const toP = (y: number, ms: number[]) => ms.map((m) => y * 100 + m);
  const qLabel = (y: number) => `Q${sel.quarter}-${yy(y)}`;

  let banner: string;
  let cyLabel: string;
  let pyLabel: string;
  if (!cyMonths.length) {
    cyLabel = sel.month ? monthsLabel(wanted, sel.cyYear) : qLabel(sel.cyYear);
    pyLabel = sel.month ? monthsLabel(wanted, sel.pyYear) : qLabel(sel.pyYear);
    banner = `No ${sel.cyYear} data for ${cyLabel}` + (sel.likeForLike ? ' – like-for-like comparison is empty' : ` – comparing against ${pyLabel}`);
  } else if (sel.month) {
    cyLabel = monthsLabel(wanted, sel.cyYear);
    pyLabel = monthsLabel(wanted, sel.pyYear);
    banner = `Comparing ${cyLabel} vs ${pyLabel}`;
  } else if (complete) {
    cyLabel = qLabel(sel.cyYear);
    pyLabel = qLabel(sel.pyYear);
    banner = `Comparing ${cyLabel} vs ${pyLabel} (all ${wanted.length} months)`;
  } else if (sel.likeForLike) {
    cyLabel = monthsLabel(cyMonths, sel.cyYear);
    pyLabel = monthsLabel(cyMonths, sel.pyYear);
    banner = `Comparing ${cyLabel} vs ${pyLabel} (like-for-like)`;
  } else {
    cyLabel = `${qLabel(sel.cyYear)} (${monthsLabel(cyMonths, sel.cyYear)} only)`;
    pyLabel = `${qLabel(sel.pyYear)} (full quarter)`;
    banner = `Comparing ${cyLabel} vs ${pyLabel} – like-for-like is off`;
  }
  const chartMonths = [...new Set([...cyMonths, ...pyMonths])].sort((a, b) => a - b);
  return {
    cyPeriods: toP(sel.cyYear, cyMonths),
    pyPeriods: toP(sel.pyYear, pyMonths),
    cyMonths,
    pyMonths,
    chartMonths,
    complete,
    banner,
    cyLabel,
    pyLabel,
  };
}
