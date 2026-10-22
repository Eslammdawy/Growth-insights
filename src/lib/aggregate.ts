/**
 * Aggregation engine: a single pass over the columnar dataset per query.
 * Pure functions (memoised per dataset via WeakMap) so they run identically on the main thread,
 * in the Web Worker and in tests.
 */
import { EXPANDABLE_SUBTYPES, TxType, UNASSIGNED_CHAIN_LABEL, UNASSIGNED_LABEL } from './config';
import { Dataset, StrColumn, numCol, strCol } from './columnar';
import { Sums, emptySums } from './metrics';
import {
  MONTH_ABBR,
  PeriodAvailability,
  PeriodSelection,
  ResolvedPeriod,
  availabilityFromPeriods,
  resolvePeriod,
} from './periods';

export type Level = 'subtype' | 'territory' | 'brick' | 'customer' | 'distributor';
export const LEVELS: Level[] = ['subtype', 'territory', 'brick', 'customer', 'distributor'];
export const LEVEL_LABEL: Record<Level, string> = {
  subtype: 'SubType',
  territory: 'Territory',
  brick: 'Brick',
  customer: 'Customer',
  distributor: 'Distributor',
};

export type DrillField = 'SubType' | 'Chain' | 'Territory' | 'Brick' | 'CustomerID' | 'Distributor';
export const LEVEL_FIELD: Record<Level, DrillField> = {
  subtype: 'SubType',
  territory: 'Territory',
  brick: 'Brick',
  customer: 'CustomerID',
  distributor: 'Distributor',
};
/** Drill-down auto-advance: SubType / Distributor → Territory → Brick → Customer (stay). */
export const NEXT_LEVEL: Record<Level, Level> = {
  subtype: 'territory',
  distributor: 'territory',
  territory: 'brick',
  brick: 'customer',
  customer: 'customer',
};

export interface DrillChip {
  field: DrillField;
  value: string;
  label: string;
}

export interface AnalysisQuery {
  period: PeriodSelection;
  txTypes: TxType[];
  /** null = All Lines */
  line: string | null;
  brands: string[];
  items: string[];
  mainTypes: string[];
  drill: DrillChip[];
  level: Level;
}

export interface GroupRow {
  id: string;
  field: DrillField;
  value: string;
  label: string;
  sums: Sums;
  rowCount: number;
  /** SubType rows of expandable SubTypes: per-Chain breakdown (sums add up to the parent). */
  children?: GroupRow[];
  /** For Chain children: the parent SubType value. */
  parentValue?: string;
  /** Brick level: dominant Territory (+ others). */
  territory?: string;
  territoryOthers?: string[];
  /** Customer level */
  customerId?: string;
  brick?: string;
  brickOthers?: string[];
  subType?: string;
  subTypeOthers?: string[];
}

export interface LineSummary {
  line: string;
  sums: Sums;
}

export interface MonthPoint {
  month: number;
  label: string;
  sums: Sums;
}

export interface AnalysisResult {
  period: ResolvedPeriod;
  totals: Sums;
  months: MonthPoint[];
  rows: GroupRow[];
  /** Per-Line totals for the sidebar badges (respect global filters + drill chips, ignore Line/Brand/Item). */
  lines: LineSummary[];
  linesTotal: Sums;
  matchedRows: number;
}

export interface DatasetMeta {
  rowCount: number;
  columns: string[];
  availability: PeriodAvailability;
  lines: string[];
  mainTypes: string[];
  /** Unique (line, brand, item) triples for cascading filter options. */
  products: [string, string, string][];
  transactionTypes: { name: string; rows: number; included: boolean }[];
}

// ---------------------------------------------------------------------------------------------
// Prepared (per-dataset, memoised) structures
// ---------------------------------------------------------------------------------------------

interface CustomerInfo {
  name: string;
  brick: string;
  subType: string;
  brickOthers: string[];
  subTypeOthers: string[];
}

export interface Prepared {
  ds: Dataset;
  n: number;
  qty: Float64Array;
  val: Float64Array;
  periods: number[];
  periodIdx: Uint16Array;
  /** 0 = excluded (Bonus, Return Bonus, other), 1 = Sales, 2 = Return Sales */
  tx: Uint8Array;
  c: {
    line: StrColumn;
    brand: StrColumn;
    item: StrColumn;
    mainType: StrColumn;
    subType: StrColumn;
    brick: StrColumn;
    territory: StrColumn;
    chain: StrColumn;
    customerId: StrColumn;
    customerName: StrColumn;
    distributor: StrColumn;
    transactionType: StrColumn;
  };
  availability: PeriodAvailability;
  customerInfo?: Map<number, CustomerInfo>;
}

const preparedCache = new WeakMap<Dataset, Prepared>();

export function normTx(s: string): TxType | null {
  const k = s.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (k === 'sales' || k === 'sale') return 'Sales';
  if (k === 'return sales' || k === 'returns sales' || k === 'return sale' || k === 'sales return' || k === 'sales returns') return 'Return Sales';
  return null;
}

export function prepare(ds: Dataset): Prepared {
  const hit = preparedCache.get(ds);
  if (hit) return hit;
  const n = ds.rowCount;
  const date = numCol(ds, 'Date').values;
  const q0 = numCol(ds, 'Quantity').values;
  const v0 = numCol(ds, 'Value').values;
  const qty = new Float64Array(n);
  const val = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const q = q0[i];
    const v = v0[i];
    qty[i] = q === q ? q : 0;
    val[i] = v === v ? v : 0;
  }
  const periodMap = new Map<number, number>();
  const periods: number[] = [];
  const periodIdx = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const d = date[i];
    let k = periodMap.get(d);
    if (k === undefined) {
      k = periods.length;
      periods.push(d);
      periodMap.set(d, k);
    }
    periodIdx[i] = k;
  }
  const transactionType = strCol(ds, 'TransactionType');
  const txOfCode = transactionType.dict.map((s) => {
    const t = normTx(s);
    return t === 'Sales' ? 1 : t === 'Return Sales' ? 2 : 0;
  });
  const tx = new Uint8Array(n);
  for (let i = 0; i < n; i++) tx[i] = txOfCode[transactionType.codes[i]];

  const p: Prepared = {
    ds,
    n,
    qty,
    val,
    periods,
    periodIdx,
    tx,
    c: {
      line: strCol(ds, 'Line'),
      brand: strCol(ds, 'Brand'),
      item: strCol(ds, 'Item'),
      mainType: strCol(ds, 'MainType'),
      subType: strCol(ds, 'SubType'),
      brick: strCol(ds, 'Brick'),
      territory: strCol(ds, 'Territory'),
      chain: strCol(ds, 'Chain'),
      customerId: strCol(ds, 'CustomerID'),
      customerName: strCol(ds, 'CustomerName'),
      distributor: strCol(ds, 'Distributor'),
      transactionType,
    },
    availability: availabilityFromPeriods(periods),
  };
  preparedCache.set(ds, p);
  return p;
}

/**
 * Customer attributes: Brick / SubType from the customer's most recent month (CY first, since CY is later),
 * computed over all rows of the dataset. Ties within the month → value with most rows, then first seen.
 * Others = every other Brick / SubType value seen for the customer anywhere in the dataset.
 */
export function customerInfo(p: Prepared): Map<number, CustomerInfo> {
  if (p.customerInfo) return p.customerInfo;
  const { customerId, customerName, brick, subType } = p.c;
  const nCust = customerId.dict.length;
  const latest = new Float64Array(nCust).fill(-Infinity);
  const date = p.periods;
  for (let i = 0; i < p.n; i++) {
    const c = customerId.codes[i];
    const d = date[p.periodIdx[i]];
    if (d > latest[c]) latest[c] = d;
  }
  const brickCount = new Map<number, Map<number, number>>();
  const subCount = new Map<number, Map<number, number>>();
  const brickAll = new Map<number, Set<number>>();
  const subAll = new Map<number, Set<number>>();
  const nameCode = new Int32Array(nCust).fill(-1);
  const bump = (m: Map<number, Map<number, number>>, c: number, k: number) => {
    let mm = m.get(c);
    if (!mm) m.set(c, (mm = new Map()));
    mm.set(k, (mm.get(k) ?? 0) + 1);
  };
  const add = (m: Map<number, Set<number>>, c: number, k: number) => {
    let s = m.get(c);
    if (!s) m.set(c, (s = new Set()));
    s.add(k);
  };
  for (let i = 0; i < p.n; i++) {
    const c = customerId.codes[i];
    const b = brick.codes[i];
    const s = subType.codes[i];
    add(brickAll, c, b);
    add(subAll, c, s);
    if (date[p.periodIdx[i]] === latest[c]) {
      bump(brickCount, c, b);
      bump(subCount, c, s);
      if (nameCode[c] <= 0) nameCode[c] = customerName.codes[i]; // first non-empty name in the latest month
    }
  }
  const pick = (m: Map<number, number> | undefined) => {
    let best = 0;
    let bestN = -1;
    if (m) for (const [k, cnt] of m) if (cnt > bestN) (best = k), (bestN = cnt);
    return best;
  };
  const out = new Map<number, CustomerInfo>();
  for (const [c, bset] of brickAll) {
    const b = pick(brickCount.get(c));
    const s = pick(subCount.get(c));
    const sset = subAll.get(c) ?? new Set<number>();
    out.set(c, {
      name: customerName.dict[Math.max(0, nameCode[c])],
      brick: brick.dict[b],
      subType: subType.dict[s],
      brickOthers: [...bset].filter((k) => k !== b).map((k) => brick.dict[k] || UNASSIGNED_LABEL).sort(),
      subTypeOthers: [...sset].filter((k) => k !== s).map((k) => subType.dict[k] || UNASSIGNED_LABEL).sort(),
    });
  }
  p.customerInfo = out;
  return out;
}

export function buildMeta(ds: Dataset): DatasetMeta {
  const p = prepare(ds);
  const { line, brand, item, mainType, transactionType } = p.c;
  const triples = new Set<string>();
  const tripleList: [string, string, string][] = [];
  const lineUsed = new Uint8Array(line.dict.length);
  const mtUsed = new Uint8Array(mainType.dict.length);
  const txRows = new Int32Array(transactionType.dict.length);
  for (let i = 0; i < p.n; i++) {
    const l = line.codes[i];
    const b = brand.codes[i];
    const it = item.codes[i];
    lineUsed[l] = 1;
    mtUsed[mainType.codes[i]] = 1;
    txRows[transactionType.codes[i]]++;
    const key = `${l}|${b}|${it}`;
    if (!triples.has(key)) {
      triples.add(key);
      tripleList.push([line.dict[l], brand.dict[b], item.dict[it]]);
    }
  }
  const used = (col: StrColumn, u: Uint8Array) => col.dict.filter((_, k) => u[k]).sort((a, b) => a.localeCompare(b));
  return {
    rowCount: p.n,
    columns: ds.columns.map((c) => c.name),
    availability: p.availability,
    lines: used(line, lineUsed),
    mainTypes: used(mainType, mtUsed),
    products: tripleList,
    transactionTypes: transactionType.dict
      .map((name, k) => ({ name: name || UNASSIGNED_LABEL, rows: txRows[k], included: normTx(name) !== null }))
      .filter((t) => t.rows > 0),
  };
}

/** Brand options for the active Line (all lines when null). */
export function brandOptions(meta: Pick<DatasetMeta, 'products'>, line: string | null): string[] {
  const s = new Set<string>();
  for (const [l, b] of meta.products) if (line === null || l === line) s.add(b);
  return [...s].sort((a, b) => a.localeCompare(b));
}

/** Item options cascading from Line + selected Brands. */
export function itemOptions(meta: Pick<DatasetMeta, 'products'>, line: string | null, brands: string[]): string[] {
  const bs = new Set(brands);
  const s = new Set<string>();
  for (const [l, b, it] of meta.products) if ((line === null || l === line) && (!bs.size || bs.has(b))) s.add(it);
  return [...s].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------------------------

function mask(col: StrColumn, values: string[] | null | undefined): Uint8Array | null {
  if (!values || !values.length) return null;
  const set = new Set(values.map((v) => v.trim()));
  const m = new Uint8Array(col.dict.length);
  for (let k = 0; k < col.dict.length; k++) if (set.has(col.dict[k])) m[k] = 1;
  return m;
}

const DRILL_COL: Record<DrillField, keyof Prepared['c']> = {
  SubType: 'subType',
  Chain: 'chain',
  Territory: 'territory',
  Brick: 'brick',
  CustomerID: 'customerId',
  Distributor: 'distributor',
};
const LEVEL_COL: Record<Level, keyof Prepared['c']> = {
  subtype: 'subType',
  territory: 'territory',
  brick: 'brick',
  customer: 'customerId',
  distributor: 'distributor',
};

const sumsAt = (a: Float64Array, k: number): Sums => ({ pyQ: a[k * 4], pyV: a[k * 4 + 1], cyQ: a[k * 4 + 2], cyV: a[k * 4 + 3] });

export function analyze(ds: Dataset, query: AnalysisQuery): AnalysisResult {
  const p = prepare(ds);
  const period = resolvePeriod(p.availability, query.period);
  const c = p.c;

  // Period flags per period index: 1 = PY, 2 = CY
  const pyS = new Set(period.pyPeriods);
  const cyS = new Set(period.cyPeriods);
  const pflag = new Uint8Array(p.periods.length);
  const monthOfP = new Int32Array(p.periods.length);
  p.periods.forEach((d, k) => {
    pflag[k] = cyS.has(d) ? 2 : pyS.has(d) ? 1 : 0;
    monthOfP[k] = d % 100;
  });

  const txAllowed = new Uint8Array(3);
  for (const t of query.txTypes) txAllowed[t === 'Sales' ? 1 : 2] = 1;

  // Global filters (affect sidebar badges)
  const globalMasks: [Int32Array, Uint8Array][] = [];
  const mt = mask(c.mainType, query.mainTypes);
  if (mt) globalMasks.push([c.mainType.codes, mt]);
  const byField = new Map<DrillField, string[]>();
  for (const chip of query.drill) byField.set(chip.field, [...(byField.get(chip.field) ?? []), chip.value]);
  for (const [field, values] of byField) {
    const col = c[DRILL_COL[field]];
    globalMasks.push([col.codes, mask(col, values)!]);
  }
  // Product filters (ignored by sidebar badges)
  const productMasks: [Int32Array, Uint8Array][] = [];
  const lm = query.line === null ? null : mask(c.line, [query.line]);
  if (lm) productMasks.push([c.line.codes, lm]);
  const bm = mask(c.brand, query.brands);
  if (bm) productMasks.push([c.brand.codes, bm]);
  const im = mask(c.item, query.items);
  if (im) productMasks.push([c.item.codes, im]);

  const lineAcc = new Float64Array(c.line.dict.length * 4);
  const lineCnt = new Int32Array(c.line.dict.length);
  const monthAcc = new Float64Array(13 * 4);
  const groupCol = c[LEVEL_COL[query.level]];
  const gcodes = groupCol.codes;
  const gAcc = new Float64Array(groupCol.dict.length * 4);
  const gCnt = new Int32Array(groupCol.dict.length);
  const totals = emptySums();
  let matched = 0;

  // SubType → Chain children
  const expandable = new Uint8Array(c.subType.dict.length);
  if (query.level === 'subtype') {
    const ex = new Set(EXPANDABLE_SUBTYPES);
    c.subType.dict.forEach((s, k) => (expandable[k] = ex.has(s) ? 1 : 0));
  }
  const childAcc = new Map<number, Float64Array>();
  const childCnt = new Map<number, Int32Array>();
  const chainCodes = c.chain.codes;
  const nChain = c.chain.dict.length;
  // Brick → territory weights
  const terrW = query.level === 'brick' ? new Map<number, Map<number, number>>() : null;

  const { qty, val, tx, periodIdx } = p;
  const lineCodes = c.line.codes;
  const ng = globalMasks.length;
  const np = productMasks.length;

  rows: for (let i = 0; i < p.n; i++) {
    if (!txAllowed[tx[i]]) continue;
    const pk = periodIdx[i];
    const f = pflag[pk];
    if (!f) continue;
    for (let j = 0; j < ng; j++) if (!globalMasks[j][1][globalMasks[j][0][i]]) continue rows;
    const q = qty[i];
    const v = val[i];
    const off = f === 2 ? 2 : 0;
    const l = lineCodes[i];
    lineAcc[l * 4 + off] += q;
    lineAcc[l * 4 + off + 1] += v;
    lineCnt[l]++;
    for (let j = 0; j < np; j++) if (!productMasks[j][1][productMasks[j][0][i]]) continue rows;
    matched++;
    if (f === 2) {
      totals.cyQ += q;
      totals.cyV += v;
    } else {
      totals.pyQ += q;
      totals.pyV += v;
    }
    const m = monthOfP[pk];
    monthAcc[m * 4 + off] += q;
    monthAcc[m * 4 + off + 1] += v;
    const g = gcodes[i];
    gAcc[g * 4 + off] += q;
    gAcc[g * 4 + off + 1] += v;
    gCnt[g]++;
    if (expandable[g]) {
      let ca = childAcc.get(g);
      if (!ca) {
        ca = new Float64Array(nChain * 4);
        childAcc.set(g, ca);
        childCnt.set(g, new Int32Array(nChain));
      }
      const ch = chainCodes[i];
      ca[ch * 4 + off] += q;
      ca[ch * 4 + off + 1] += v;
      childCnt.get(g)![ch]++;
    }
    if (terrW) {
      let tm = terrW.get(g);
      if (!tm) terrW.set(g, (tm = new Map()));
      const t = c.territory.codes[i];
      tm.set(t, (tm.get(t) ?? 0) + Math.abs(v) + 1e-6);
    }
  }

  // Build rows
  const field = LEVEL_FIELD[query.level];
  const cinfo = query.level === 'customer' ? customerInfo(p) : null;
  const rowsOut: GroupRow[] = [];
  for (let g = 0; g < groupCol.dict.length; g++) {
    if (!gCnt[g]) continue;
    const value = groupCol.dict[g];
    const row: GroupRow = {
      id: `${field}:${value}`,
      field,
      value,
      label: value || UNASSIGNED_LABEL,
      sums: sumsAt(gAcc, g),
      rowCount: gCnt[g],
    };
    if (expandable[g] && childAcc.has(g)) {
      const ca = childAcc.get(g)!;
      const cc = childCnt.get(g)!;
      row.children = [];
      for (let k = 0; k < nChain; k++) {
        if (!cc[k]) continue;
        const cv = c.chain.dict[k];
        row.children.push({
          id: `${row.id}|Chain:${cv}`,
          field: 'Chain',
          value: cv,
          label: cv || UNASSIGNED_CHAIN_LABEL,
          sums: sumsAt(ca, k),
          rowCount: cc[k],
          parentValue: value,
        });
      }
    }
    if (terrW) {
      const tm = terrW.get(g)!;
      let best = -1;
      let bw = -1;
      for (const [t, w] of tm) if (w > bw) (best = t), (bw = w);
      row.territory = c.territory.dict[best] || UNASSIGNED_LABEL;
      row.territoryOthers = [...tm.keys()].filter((t) => t !== best).map((t) => c.territory.dict[t] || UNASSIGNED_LABEL).sort();
    }
    if (cinfo) {
      const info = cinfo.get(g);
      row.customerId = value;
      row.label = info?.name || value || UNASSIGNED_LABEL;
      row.brick = info?.brick || UNASSIGNED_LABEL;
      row.subType = info?.subType || UNASSIGNED_LABEL;
      row.brickOthers = info?.brickOthers ?? [];
      row.subTypeOthers = info?.subTypeOthers ?? [];
    }
    rowsOut.push(row);
  }

  const lines: LineSummary[] = [];
  const linesTotal = emptySums();
  for (let l = 0; l < c.line.dict.length; l++) {
    if (!lineCnt[l]) continue;
    const s = sumsAt(lineAcc, l);
    lines.push({ line: c.line.dict[l], sums: s });
    linesTotal.pyQ += s.pyQ;
    linesTotal.pyV += s.pyV;
    linesTotal.cyQ += s.cyQ;
    linesTotal.cyV += s.cyV;
  }

  const months: MonthPoint[] = period.chartMonths.map((m) => ({ month: m, label: MONTH_ABBR[m - 1], sums: sumsAt(monthAcc, m) }));

  return { period, totals, months, rows: rowsOut, lines, linesTotal, matchedRows: matched };
}

/** Sum of a list of group rows (used for validation and totals). */
export function sumRows(rows: { sums: Sums }[]): Sums {
  const s = emptySums();
  for (const r of rows) {
    s.pyQ += r.sums.pyQ;
    s.pyV += r.sums.pyV;
    s.cyQ += r.sums.cyQ;
    s.cyV += r.sums.cyV;
  }
  return s;
}
