import { DatasetMeta, DrillChip, brandOptions, itemOptions, subTypeOptions } from './aggregate';
import { METRICS, Metric } from './metrics';
import { PeriodSelection, quarterMonths } from './periods';

export interface ParsedHashState {
  metric?: Metric;
  line?: string | null;
  cyYear?: number;
  quarter?: number;
  month?: number | null;
  likeForLike?: boolean;
  brands?: string[];
  items?: string[];
  mainTypes?: string[];
  subTypes?: string[];
  distributors?: string[];
  territories?: string[];
  txTypes?: ('Sales' | 'Return Sales')[];
  drill?: DrillChip[];
}

export function parseHashParams(hashString: string): ParsedHashState {
  if (!hashString) return {};
  const raw = hashString.replace(/^#/, '');
  if (!raw) return {};

  const params = new URLSearchParams(raw);
  const out: ParsedHashState = {};

  if (params.has('metric')) {
    const m = params.get('metric') as Metric;
    if (METRICS.includes(m)) out.metric = m;
  }

  if (params.has('line')) {
    const l = params.get('line')!;
    out.line = l === 'all' || l === '' ? null : l;
  }

  if (params.has('year')) {
    const y = parseInt(params.get('year')!, 10);
    if (!Number.isNaN(y)) out.cyYear = y;
  }

  if (params.has('q')) {
    const q = parseInt(params.get('q')!, 10);
    if (q >= 1 && q <= 4) out.quarter = q;
  }

  if (params.has('m')) {
    const m = params.get('m')!;
    if (m === 'all' || m === '') {
      out.month = null;
    } else {
      const monthNum = parseInt(m, 10);
      if (!Number.isNaN(monthNum)) out.month = monthNum;
    }
  }

  if (params.has('lfl')) {
    out.likeForLike = params.get('lfl') !== '0' && params.get('lfl') !== 'false';
  }

  if (params.has('mainTypes')) {
    const mt = params.get('mainTypes')!;
    if (mt) out.mainTypes = mt.split(',').filter(Boolean);
  }

  if (params.has('subTypes')) {
    const st = params.get('subTypes')!;
    if (st) out.subTypes = st.split(',').filter(Boolean);
  }

  if (params.has('distributors')) {
    const d = params.get('distributors')!;
    if (d) out.distributors = d.split(',').filter(Boolean);
  }

  if (params.has('territories')) {
    const tr = params.get('territories')!;
    if (tr) out.territories = tr.split(',').filter(Boolean);
  }

  if (params.has('txTypes')) {
    const tt = params.get('txTypes')!;
    if (tt) {
      const parsed = tt.split(',').filter((t): t is 'Sales' | 'Return Sales' => t === 'Sales' || t === 'Return Sales');
      if (parsed.length > 0) out.txTypes = parsed;
    }
  }

  if (params.has('brands')) {
    const b = params.get('brands')!;
    if (b) out.brands = b.split(',').filter(Boolean);
  }

  if (params.has('items')) {
    const it = params.get('items')!;
    if (it) out.items = it.split(',').filter(Boolean);
  }

  if (params.has('drill')) {
    try {
      const parsed = JSON.parse(params.get('drill')!);
      if (Array.isArray(parsed)) {
        out.drill = parsed.filter(
          (c) => c && typeof c.field === 'string' && typeof c.value === 'string' && typeof c.label === 'string',
        );
      }
    } catch {
      // ignore invalid json in drill
    }
  }

  return out;
}

export function validateHashAgainstMeta(
  parsed: ParsedHashState,
  meta: DatasetMeta,
  currentPeriod: PeriodSelection,
): {
  metric?: Metric;
  line: string | null;
  period: PeriodSelection;
  mainTypes: string[];
  subTypes: string[];
  distributors: string[];
  territories: string[];
  txTypes: ('Sales' | 'Return Sales')[];
  brands: string[];
  items: string[];
  drill: DrillChip[];
} {
  const line = parsed.line && meta.lines.includes(parsed.line) ? parsed.line : null;

  const cyYear =
    parsed.cyYear && meta.availability.years.includes(parsed.cyYear)
      ? parsed.cyYear
      : currentPeriod.cyYear;

  const quarter =
    parsed.quarter && parsed.quarter >= 1 && parsed.quarter <= 4
      ? parsed.quarter
      : currentPeriod.quarter;

  const validMonths = quarterMonths(quarter);
  const month =
    parsed.month !== undefined && (parsed.month === null || validMonths.includes(parsed.month))
      ? parsed.month
      : currentPeriod.month && validMonths.includes(currentPeriod.month)
        ? currentPeriod.month
        : null;

  const likeForLike = parsed.likeForLike ?? currentPeriod.likeForLike ?? true;

  const period: PeriodSelection = {
    cyYear,
    pyYear: cyYear - 1,
    quarter,
    month,
    likeForLike,
  };

  const mainTypes = parsed.mainTypes
    ? parsed.mainTypes.filter((m) => meta.mainTypes.includes(m))
    : [];

  const availableSubTypes = subTypeOptions(meta, mainTypes);
  const subTypes = parsed.subTypes
    ? parsed.subTypes.filter((s) => availableSubTypes.includes(s))
    : [];

  const distributors = parsed.distributors
    ? parsed.distributors.filter((d) => meta.distributors.includes(d))
    : [];

  const territories = parsed.territories
    ? parsed.territories.filter((t) => meta.territories.includes(t))
    : [];

  const txTypes = parsed.txTypes && parsed.txTypes.length > 0
    ? parsed.txTypes
    : (['Sales', 'Return Sales'] as ('Sales' | 'Return Sales')[]);

  const availableBrands = brandOptions(meta, line);
  const brands = parsed.brands
    ? parsed.brands.filter((b) => availableBrands.includes(b))
    : [];

  const availableItems = itemOptions(meta, line, brands);
  const items = parsed.items
    ? parsed.items.filter((it) => availableItems.includes(it))
    : [];

  const validDrillFields = new Set(['SubType', 'Chain', 'Distributor', 'Territory', 'Brick', 'Customer', 'CustomerID', 'Item']);
  const drill = (parsed.drill ?? []).filter((c) => validDrillFields.has(c.field));

  return {
    metric: parsed.metric,
    line,
    period,
    mainTypes,
    subTypes,
    distributors,
    territories,
    txTypes,
    brands,
    items,
    drill,
  };
}

export function serializeHashState(state: {
  metric: Metric;
  line?: string | null;
  period: PeriodSelection;
  mainTypes: string[];
  subTypes?: string[];
  distributors?: string[];
  territories?: string[];
  txTypes: ('Sales' | 'Return Sales')[];
  brands?: string[];
  items?: string[];
  drill: DrillChip[];
}): string {
  const params = new URLSearchParams();
  if (state.metric) params.set('metric', state.metric);
  if (state.line) params.set('line', state.line);
  params.set('year', String(state.period.cyYear));
  params.set('q', String(state.period.quarter));
  if (state.period.month !== null) {
    params.set('m', String(state.period.month));
  }
  if (!state.period.likeForLike) {
    params.set('lfl', '0');
  }
  if (state.mainTypes && state.mainTypes.length > 0) {
    params.set('mainTypes', state.mainTypes.join(','));
  }
  if (state.subTypes && state.subTypes.length > 0) {
    params.set('subTypes', state.subTypes.join(','));
  }
  if (state.distributors && state.distributors.length > 0) {
    params.set('distributors', state.distributors.join(','));
  }
  if (state.territories && state.territories.length > 0) {
    params.set('territories', state.territories.join(','));
  }
  if (state.txTypes && (state.txTypes.length !== 2 || !state.txTypes.includes('Sales') || !state.txTypes.includes('Return Sales'))) {
    params.set('txTypes', state.txTypes.join(','));
  }
  if (state.brands && state.brands.length > 0) {
    params.set('brands', state.brands.join(','));
  }
  if (state.items && state.items.length > 0) {
    params.set('items', state.items.join(','));
  }
  if (state.drill && state.drill.length > 0) {
    params.set('drill', JSON.stringify(state.drill));
  }
  return '#' + params.toString();
}

export function subscribeHash(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
    window.removeEventListener('popstate', callback);
  };
}

export function getHashSnapshot(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash;
}
