/**
 * Period logic: years / quarters / months derived from the numeric YYYYMM `Date` column.
 */

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const yearOf = (yyyymm: number) => Math.floor(yyyymm / 100);
export const monthOf = (yyyymm: number) => yyyymm % 100;
export const quarterOfMonth = (month: number) => Math.ceil(month / 3);
export const quarterMonths = (q: number | null): number[] => (q === null ? ALL_MONTHS : [3 * q - 2, 3 * q - 1, 3 * q]);
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
  quarter: number | null; // null = All Qs (1..12), 1..4 = Q1..Q4
  month: number | null; // optional single month within the quarter (or full year)
  likeForLike: boolean;
}

/** Default selection: latest year = CY, prior year = PY, All Qs / All months with like-for-like ON. */
export function defaultSelection(av: PeriodAvailability): PeriodSelection {
  const cyYear = av.years[av.years.length - 1] ?? new Date().getFullYear();
  return { cyYear, pyYear: cyYear - 1, quarter: null, month: null, likeForLike: true };
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
  const scopeLabel = (y: number) => (sel.quarter === null ? `FY-${yy(y)}` : `Q${sel.quarter}-${yy(y)}`);
  const fullScopeText = sel.quarter === null ? 'full year' : 'full quarter';

  let banner: string;
  let cyLabel: string;
  let pyLabel: string;
  if (!cyMonths.length) {
    cyLabel = sel.month ? monthsLabel(wanted, sel.cyYear) : scopeLabel(sel.cyYear);
    pyLabel = sel.month ? monthsLabel(wanted, sel.pyYear) : scopeLabel(sel.pyYear);
    banner = `No ${sel.cyYear} data for ${cyLabel}` + (sel.likeForLike ? ' – like-for-like comparison is empty' : ` – comparing against ${pyLabel}`);
  } else if (sel.month) {
    cyLabel = monthsLabel(wanted, sel.cyYear);
    pyLabel = monthsLabel(wanted, sel.pyYear);
    banner = `Comparing ${cyLabel} vs ${pyLabel}`;
  } else if (complete) {
    cyLabel = scopeLabel(sel.cyYear);
    pyLabel = scopeLabel(sel.pyYear);
    banner = `Comparing ${cyLabel} vs ${pyLabel} (all ${wanted.length} months)`;
  } else if (sel.likeForLike) {
    cyLabel = monthsLabel(cyMonths, sel.cyYear);
    pyLabel = monthsLabel(cyMonths, sel.pyYear);
    banner = `Comparing ${cyLabel} vs ${pyLabel} (like-for-like)`;
  } else {
    cyLabel = `${scopeLabel(sel.cyYear)} (${monthsLabel(cyMonths, sel.cyYear)} only)`;
    pyLabel = `${scopeLabel(sel.pyYear)} (${fullScopeText})`;
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
