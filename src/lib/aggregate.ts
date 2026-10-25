/**
 * Aggregation engine: a single pass over the columnar dataset per query.
 * Pure functions (memoised per dataset via WeakMap) so they run identically on the main thread,
 * in the Web Worker and in tests.
 *
 * Customer identity: rows with the same CustomerID AND CustomerName are one customer. Every row of a
 * customer is attributed to the customer's latest (CY) Brick and the Territory recorded with it, so a
 * customer that moved brick between PY and CY is compared like-for-like in its current brick.
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
/** Display order of the level tables on the dashboard. */
export const LEVELS: Level[] = ['subtype', 'distributor', 'territory', 'brick', 'customer'];
/** Display order of the level tables rendered on the dashboard. */
export const TABLE_LEVELS: Level[] = ['subtype', 'distributor', 'territory', 'customer'];
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
export const DRILL_FIELD_LABEL: Record<DrillField, string> = {
  SubType: 'SubType',
  Chain: 'Chain',
  Territory: 'Territory',
  Brick: 'Brick',
  CustomerID: 'Customer',
  Distributor: 'Distributor',
};

/** Cross-filter chip (added from the filter button of a table row). */
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
}

export interface GroupRow {
  id: string;
  field: DrillField | 'Item';
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
  /** Item rows: brand of the item. */
  brand?: string;
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
  /** One table per level. */
  levels: Record<Level, GroupRow[]>;
  /** Per-Line totals for the sidebar badges (respect global filters + drill chips, ignore Line/Brand/Item). */
  lines: LineSummary[];
  linesTotal: Sums;
  matchedRows: number;
}

/** Identifies the table row whose Item breakdown is requested. */
export interface ItemTarget {
  level: Level;
  value: string;
  /** Chain child of an expandable SubType row. */
  chain?: string;
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
  id: string;
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
    /** Effective Brick: the customer's latest (CY) brick for every row of that customer. */
    brick: StrColumn;
    /** Effective Territory: the territory recorded with the customer's latest brick. */
    territory: StrColumn;
    chain: StrColumn;
    /** Customer key = CustomerID + CustomerName (one customer). */
    customer: StrColumn;
    distributor: StrColumn;
    transactionType: StrColumn;
  };
  availability: PeriodAvailability;
  customerInfo: Map<number, CustomerInfo>;
  /** Brand of each item code (first seen). */
  itemBrand: Int32Array;
}

const preparedCache = new WeakMap<Dataset, Prepared>();

/** Separator inside customer key values (`<CustomerID>␟<CustomerName>`). */
export const CUSTOMER_KEY_SEP = '\u241F';

export function normTx(s: string): TxType | null {
  const k = s.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (k === 'sales' || k === 'sale') return 'Sales';
  if (k === 'return sales' || k === 'returns sales' || k === 'return sale' || k === 'sales return' || k === 'sales returns') return 'Return Sales';
  return null;
}

/** Build the customer key column: same CustomerID + same CustomerName = one customer. Blank ID & Name → code 0. */
function buildCustomerColumn(n: number, id: StrColumn, name: StrColumn): StrColumn {
  const dict: string[] = [''];
  const index = new Map<number, number>();
  const codes = new Int32Array(n);
  const nName = name.dict.length + 1;
  for (let i = 0; i < n; i++) {
    const ic = id.codes[i];
    const nc = name.codes[i];
    if (ic === 0 && nc === 0) continue;
    const k = ic * nName + nc;
    let code = index.get(k);
    if (code === undefined) {
      code = dict.length;
      dict.push(`${id.dict[ic]}${CUSTOMER_KEY_SEP}${name.dict[nc]}`);
      index.set(k, code);
    }
    codes[i] = code;
  }
  return { kind: 'str', name: 'Customer', dict, codes };
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

  const customerId = strCol(ds, 'CustomerID');
  const customerName = strCol(ds, 'CustomerName');
  const rawBrick = strCol(ds, 'Brick');
  const rawTerritory = strCol(ds, 'Territory');
  const subType = strCol(ds, 'SubType');
  const customer = buildCustomerColumn(n, customerId, customerName);

  const { info, brickOf, territoryOf } = computeCustomers(
    n,
    periods,
    periodIdx,
    tx,
    customer,
    customerId,
    customerName,
    rawBrick,
    rawTerritory,
    subType,
  );

  // Effective Brick / Territory columns (same dictionaries, remapped codes).
  const effBrick = new Int32Array(n);
  const effTerr = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const cu = customer.codes[i];
    if (cu !== 0 && brickOf[cu] >= 0) {
      effBrick[i] = brickOf[cu];
      effTerr[i] = territoryOf[cu];
    } else {
      effBrick[i] = rawBrick.codes[i];
      effTerr[i] = rawTerritory.codes[i];
    }
  }

  const item = strCol(ds, 'Item');
  const brand = strCol(ds, 'Brand');
  const itemBrand = new Int32Array(item.dict.length).fill(-1);
  for (let i = 0; i < n; i++) {
    const it = item.codes[i];
    if (itemBrand[it] < 0) itemBrand[it] = brand.codes[i];
  }

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
      brand,
      item,
      mainType: strCol(ds, 'MainType'),
      subType,
      brick: { kind: 'str', name: 'Brick', dict: rawBrick.dict, codes: effBrick },
      territory: { kind: 'str', name: 'Territory', dict: rawTerritory.dict, codes: effTerr },
      chain: strCol(ds, 'Chain'),
      customer,
      distributor: strCol(ds, 'Distributor'),
      transactionType,
    },
    availability: availabilityFromPeriods(periods),
    customerInfo: info,
    itemBrand,
  };
  preparedCache.set(ds, p);
  return p;
}

/**
 * Customer attributes from the customer's most recent month (CY first, since CY is later),
 * computed over all rows of the dataset. Ties within the month → value with most rows, then first seen.
 * The latest Brick is the customer's "true" brick; its Territory is the dominant territory recorded
 * with that brick in the latest month. Others = every other Brick / SubType value seen for the customer.
 */
function computeCustomers(
  n: number,
  date: number[],
  periodIdx: Uint16Array,
  tx: Uint8Array,
  customer: StrColumn,
  customerId: StrColumn,
  customerName: StrColumn,
  brick: StrColumn,
  territory: StrColumn,
  subType: StrColumn,
): { info: Map<number, CustomerInfo>; brickOf: Int32Array; territoryOf: Int32Array } {
  const nCust = customer.dict.length;
  const latest = new Float64Array(nCust).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    if (!tx[i]) continue;
    const c = customer.codes[i];
    const d = date[periodIdx[i]];
    if (d > latest[c]) latest[c] = d;
  }
  const brickCount = new Map<number, Map<number, number>>();
  const subCount = new Map<number, Map<number, number>>();
  const terrCount = new Map<number, Map<number, number>>(); // key: brick * nTerr + territory
  const brickAll = new Map<number, Set<number>>();
  const subAll = new Map<number, Set<number>>();
  const idCode = new Int32Array(nCust);
  const nameCode = new Int32Array(nCust);
  const nTerr = territory.dict.length;
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
  for (let i = 0; i < n; i++) {
    if (!tx[i]) continue;
    const c = customer.codes[i];
    if (c === 0) continue;
    const b = brick.codes[i];
    const s = subType.codes[i];
    idCode[c] = customerId.codes[i];
    nameCode[c] = customerName.codes[i];
    add(brickAll, c, b);
    add(subAll, c, s);
    if (date[periodIdx[i]] === latest[c]) {
      bump(brickCount, c, b);
      bump(subCount, c, s);
      bump(terrCount, c, b * nTerr + territory.codes[i]);
    }
  }
  const pick = (m: Map<number, number> | undefined, accept: (k: number) => boolean = () => true) => {
    let best = -1;
    let bestN = -1;
    if (m) for (const [k, cnt] of m) if (accept(k) && cnt > bestN) (best = k), (bestN = cnt);
    return best;
  };
  const info = new Map<number, CustomerInfo>();
  const brickOf = new Int32Array(nCust).fill(-1);
  const territoryOf = new Int32Array(nCust).fill(-1);
  for (const [c, bset] of brickAll) {
    const b = Math.max(0, pick(brickCount.get(c)));
    const s = Math.max(0, pick(subCount.get(c)));
    const tk = pick(terrCount.get(c), (k) => Math.floor(k / nTerr) === b);
    brickOf[c] = b;
    territoryOf[c] = tk < 0 ? 0 : tk % nTerr;
    const sset = subAll.get(c) ?? new Set<number>();
    info.set(c, {
      id: customerId.dict[idCode[c]],
      name: customerName.dict[nameCode[c]],
      brick: brick.dict[b],
      subType: subType.dict[s],
      brickOthers: [...bset].filter((k) => k !== b).map((k) => brick.dict[k] || UNASSIGNED_LABEL).sort(),
      subTypeOthers: [...sset].filter((k) => k !== s).map((k) => subType.dict[k] || UNASSIGNED_LABEL).sort(),
    });
  }
  return { info, brickOf, territoryOf };
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
  CustomerID: 'customer',
  Distributor: 'distributor',
};
const LEVEL_COL: Record<Level, keyof Prepared['c']> = {
  subtype: 'subType',
  territory: 'territory',
  brick: 'brick',
  customer: 'customer',
  distributor: 'distributor',
};

const sumsAt = (a: Float64Array, k: number): Sums => ({ pyQ: a[k * 4], pyV: a[k * 4 + 1], cyQ: a[k * 4 + 2], cyV: a[k * 4 + 3] });

type Masks = [Int32Array, Uint8Array][];

interface QueryContext {
  p: Prepared;
  period: ResolvedPeriod;
  /** Per period index: 0 = outside, 1 = PY, 2 = CY */
  pflag: Uint8Array;
  monthOfP: Int32Array;
  txAllowed: Uint8Array;
  /** Global filters (affect sidebar badges). */
  globalMasks: Masks;
  /** Product filters (ignored by sidebar badges). */
  productMasks: Masks;
}

function buildContext(ds: Dataset, query: AnalysisQuery): QueryContext {
  const p = prepare(ds);
  const period = resolvePeriod(p.availability, query.period);
  const c = p.c;
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

  const globalMasks: Masks = [];
  const mt = mask(c.mainType, query.mainTypes);
  if (mt) globalMasks.push([c.mainType.codes, mt]);
  const byField = new Map<DrillField, string[]>();
  for (const chip of query.drill) byField.set(chip.field, [...(byField.get(chip.field) ?? []), chip.value]);
  for (const [field, values] of byField) {
    const col = c[DRILL_COL[field]];
    globalMasks.push([col.codes, mask(col, values)!]);
  }
  const productMasks: Masks = [];
  const lm = query.line === null ? null : mask(c.line, [query.line]);
  if (lm) productMasks.push([c.line.codes, lm]);
  const bm = mask(c.brand, query.brands);
  if (bm) productMasks.push([c.brand.codes, bm]);
  const im = mask(c.item, query.items);
  if (im) productMasks.push([c.item.codes, im]);
  return { p, period, pflag, monthOfP, txAllowed, globalMasks, productMasks };
}

interface LevelAcc {
  level: Level;
  col: StrColumn;
  acc: Float64Array;
  cnt: Int32Array;
}

export function analyze(ds: Dataset, query: AnalysisQuery): AnalysisResult {
  const ctx = buildContext(ds, query);
  const { p, period, pflag, monthOfP, txAllowed, globalMasks, productMasks } = ctx;
  const c = p.c;

  const lineAcc = new Float64Array(c.line.dict.length * 4);
  const lineCnt = new Int32Array(c.line.dict.length);
  const monthAcc = new Float64Array(13 * 4);
  const levelAccs: LevelAcc[] = LEVELS.map((level) => {
    const col = c[LEVEL_COL[level]];
    return { level, col, acc: new Float64Array(col.dict.length * 4), cnt: new Int32Array(col.dict.length) };
  });
  const totals = emptySums();
  let matched = 0;

  // SubType → Chain children
  const expandable = new Uint8Array(c.subType.dict.length);
  const ex = new Set(EXPANDABLE_SUBTYPES);
  c.subType.dict.forEach((s, k) => (expandable[k] = ex.has(s) ? 1 : 0));
  const childAcc = new Map<number, Float64Array>();
  const childCnt = new Map<number, Int32Array>();
  const chainCodes = c.chain.codes;
  const subCodes = c.subType.codes;
  const nChain = c.chain.dict.length;
  // Brick → territory weights
  const terrW = new Map<number, Map<number, number>>();
  const brickCodes = c.brick.codes;
  const terrCodes = c.territory.codes;

  const { qty, val, tx, periodIdx } = p;
  const lineCodes = c.line.codes;
  const ng = globalMasks.length;
  const np = productMasks.length;
  const nl = levelAccs.length;

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
    for (let j = 0; j < nl; j++) {
      const la = levelAccs[j];
      const g = la.col.codes[i];
      la.acc[g * 4 + off] += q;
      la.acc[g * 4 + off + 1] += v;
      la.cnt[g]++;
    }
    const sg = subCodes[i];
    if (expandable[sg]) {
      let ca = childAcc.get(sg);
      if (!ca) {
        ca = new Float64Array(nChain * 4);
        childAcc.set(sg, ca);
        childCnt.set(sg, new Int32Array(nChain));
      }
      const ch = chainCodes[i];
      ca[ch * 4 + off] += q;
      ca[ch * 4 + off + 1] += v;
      childCnt.get(sg)![ch]++;
    }
    const bg = brickCodes[i];
    let tm = terrW.get(bg);
    if (!tm) terrW.set(bg, (tm = new Map()));
    const t = terrCodes[i];
    tm.set(t, (tm.get(t) ?? 0) + Math.abs(v) + 1e-6);
  }

  const levels = {} as Record<Level, GroupRow[]>;
  for (const { level, col, acc, cnt } of levelAccs) {
    const field = LEVEL_FIELD[level];
    const rowsOut: GroupRow[] = [];
    for (let g = 0; g < col.dict.length; g++) {
      if (!cnt[g]) continue;
      const value = col.dict[g];
      const row: GroupRow = {
        id: `${field}:${value}`,
        field,
        value,
        label: value || UNASSIGNED_LABEL,
        sums: sumsAt(acc, g),
        rowCount: cnt[g],
      };
      if (level === 'subtype' && expandable[g] && childAcc.has(g)) {
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
      if (level === 'brick') {
        const tm = terrW.get(g)!;
        let best = -1;
        let bw = -1;
        for (const [t, w] of tm) if (w > bw) (best = t), (bw = w);
        row.territory = c.territory.dict[best] || UNASSIGNED_LABEL;
        row.territoryOthers = [...tm.keys()].filter((t) => t !== best).map((t) => c.territory.dict[t] || UNASSIGNED_LABEL).sort();
      }
      if (level === 'customer') {
        const info = p.customerInfo.get(g);
        row.customerId = info?.id ?? '';
        row.label = info?.name || info?.id || UNASSIGNED_LABEL;
        row.brick = info?.brick || UNASSIGNED_LABEL;
        row.subType = info?.subType || UNASSIGNED_LABEL;
        row.brickOthers = info?.brickOthers ?? [];
        row.subTypeOthers = info?.subTypeOthers ?? [];
      }
      rowsOut.push(row);
    }
    levels[level] = rowsOut;
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

  return { period, totals, months, levels, lines, linesTotal, matchedRows: matched };
}

/**
 * Item breakdown of one table row (a level value, or a Chain child of an expandable SubType).
 * Uses the same filters as {@link analyze}; the returned item rows sum to the parent row.
 */
export function analyzeItems(ds: Dataset, query: AnalysisQuery, target: ItemTarget): GroupRow[] {
  const ctx = buildContext(ds, query);
  const { p, pflag, txAllowed, globalMasks, productMasks } = ctx;
  const c = p.c;
  const groupCol = c[LEVEL_COL[target.level]];
  const gCode = groupCol.dict.indexOf(target.value);
  if (gCode < 0) return [];
  const chainCode = target.chain === undefined ? -1 : c.chain.dict.indexOf(target.chain);
  if (target.chain !== undefined && chainCode < 0) return [];

  const masks: Masks = [...globalMasks, ...productMasks];
  const nm = masks.length;
  const nItem = c.item.dict.length;
  const acc = new Float64Array(nItem * 4);
  const cnt = new Int32Array(nItem);
  const { qty, val, tx, periodIdx } = p;
  const gcodes = groupCol.codes;
  const chainCodes = c.chain.codes;
  const itemCodes = c.item.codes;

  rows: for (let i = 0; i < p.n; i++) {
    if (gcodes[i] !== gCode) continue;
    if (chainCode >= 0 && chainCodes[i] !== chainCode) continue;
    if (!txAllowed[tx[i]]) continue;
    const f = pflag[periodIdx[i]];
    if (!f) continue;
    for (let j = 0; j < nm; j++) if (!masks[j][1][masks[j][0][i]]) continue rows;
    const off = f === 2 ? 2 : 0;
    const it = itemCodes[i];
    acc[it * 4 + off] += qty[i];
    acc[it * 4 + off + 1] += val[i];
    cnt[it]++;
  }

  const parentId =
    target.chain === undefined
      ? `${LEVEL_FIELD[target.level]}:${target.value}`
      : `${LEVEL_FIELD[target.level]}:${target.value}|Chain:${target.chain}`;
  const out: GroupRow[] = [];
  for (let k = 0; k < nItem; k++) {
    if (!cnt[k]) continue;
    const name = c.item.dict[k];
    const b = p.itemBrand[k];
    out.push({
      id: `${parentId}|Item:${name}`,
      field: 'Item',
      value: name,
      label: name || UNASSIGNED_LABEL,
      sums: sumsAt(acc, k),
      rowCount: cnt[k],
      brand: b >= 0 ? c.brand.dict[b] : undefined,
    });
  }
  return out;
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
