/**
 * Aggregation engine: a single pass over the columnar dataset per query.
 * Pure functions (memoised per dataset via WeakMap) so they run identically on the main thread,
 * in the Web Worker and in tests.
 *
 * Customer identity: rows with the same CustomerID AND CustomerName are one customer. Every row of a
 * customer is attributed to the customer's latest (CY) Brick and the Territory recorded with it, so a
 * customer that moved brick between PY and CY is compared like-for-like in its current brick.
 *
 * Item-to-Line reallocation: every row of an Item is attributed to the Line (and Brand) recorded in
 * that item's latest period in the Current Year (e.g. Sep 202609 first, falling back to earlier CY months
 * if the item had no Sep invoice). Items that are not allocated to any Line in CY are excluded globally
 * from the report.
 */
import {
  EXCLUDED_DISTRIBUTORS,
  EXPANDABLE_SUBTYPES,
  TxType,
  UNASSIGNED_CHAIN_LABEL,
  UNASSIGNED_LABEL,
} from './config';
import { Dataset, StrColumn, numCol, strCol } from './columnar';
import {
  Growth,
  PriceVolumeRow,
  PriceVolumeSummary,
  Sums,
  contributionPp,
  decomposePriceVolume,
  emptySums,
  growth,
  priceVolumeRow,
  shareOfTotal,
} from './metrics';
import {
  MONTH_ABBR,
  PeriodAvailability,
  PeriodSelection,
  ResolvedPeriod,
  availabilityFromPeriods,
  resolvePeriod,
  yearOf,
} from './periods';

export type Level = 'subtype' | 'distributor' | 'chain' | 'territory' | 'brick' | 'customer';
/** Display order of the level tables on the dashboard. */
export const LEVELS: Level[] = ['subtype', 'distributor', 'chain', 'territory', 'brick', 'customer'];
/** Display order of the level tables rendered on the dashboard. */
export const TABLE_LEVELS: Level[] = ['subtype', 'distributor', 'chain', 'territory', 'customer'];
export const LEVEL_LABEL: Record<Level, string> = {
  subtype: 'SubType',
  distributor: 'Distributor',
  chain: 'Chains',
  territory: 'Territory',
  brick: 'Brick',
  customer: 'Customer',
};

export type InsightLevel = 'subtype' | 'distributor' | 'territory' | 'brick' | 'item';
export const INSIGHT_LEVELS: InsightLevel[] = ['subtype', 'distributor', 'territory', 'brick', 'item'];
export const INSIGHT_LEVEL_LABEL: Record<InsightLevel, string> = {
  subtype: 'SubType',
  distributor: 'Distributor',
  territory: 'Territory',
  brick: 'Brick',
  item: 'Item',
};

export type DrillField = 'SubType' | 'Chain' | 'Territory' | 'Brick' | 'CustomerID' | 'Distributor' | 'Item';
export const LEVEL_FIELD: Record<Level, DrillField> = {
  subtype: 'SubType',
  distributor: 'Distributor',
  chain: 'Chain',
  territory: 'Territory',
  brick: 'Brick',
  customer: 'CustomerID',
};
export const DRILL_FIELD_LABEL: Record<DrillField, string> = {
  SubType: 'SubType',
  Chain: 'Chain',
  Territory: 'Territory',
  Brick: 'Brick',
  CustomerID: 'Customer',
  Distributor: 'Distributor',
  Item: 'Item',
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
  subTypes?: string[];
  distributors?: string[];
  territories?: string[];
  drill: DrillChip[];
}

export interface CascadingFilterOptions {
  mainTypes: string[];
  subTypes: string[];
  distributors: string[];
  territories: string[];
  brands: string[];
  items: string[];
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

export interface TerritoryMonthRow {
  territory: string;
  label: string;
  sums: Sums;
  months: MonthPoint[];
}

/** Phase 4 row-level Contribution-to-Growth & Price/Volume decomposition result. */
export interface ContributionRow {
  id: string;
  field: DrillField | 'Item';
  value: string;
  label: string;
  brand?: string;
  sums: Sums;
  unitsDelta: number;
  valueDelta: number;
  unitsGrowth: Growth;
  valueGrowth: Growth;
  unitsShareCy: number | null;
  valueShareCy: number | null;
  unitsContribPp: number | null;
  valueContribPp: number | null;
  pvm: PriceVolumeRow;
}

/** Phase 4 precomputed growth decomposition & contribution results. */
export interface AnalysisInsights {
  /** Item-level portfolio Price / Volume / Mix summary. */
  pvmSummary: PriceVolumeSummary;
  /** Per-level Price / Volume / Mix summary. */
  levelPvmSummary: Record<InsightLevel, PriceVolumeSummary>;
  /** Per-level contribution & price/volume rows. */
  byLevel: Record<InsightLevel, ContributionRow[]>;
}

export interface AnalysisResult {
  period: ResolvedPeriod;
  totals: Sums;
  months: MonthPoint[];
  /** Territory × Month sums for the YoY % heatmap. */
  territoryMonths: TerritoryMonthRow[];
  /** Phase 4 contribution-to-growth and price/volume decomposition results. */
  insights: AnalysisInsights;
  /** One table per level. */
  levels: Record<Level, GroupRow[]>;
  /** Cascading filter options guided by upstream filter selections. */
  filterOptions: CascadingFilterOptions;
  /** Per-Line totals for legacy compatibility (respect global filters + drill chips, ignore Line/Brand/Item). */
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
  subTypes: string[];
  distributors: string[];
  territories: string[];
  /** Unique (mainType, subType) pairs for cascading channel options. */
  channels: [string, string][];
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
  /** Effective CY Line of each item code (-1 = not allocated in CY / excluded from report). */
  itemLine: Int32Array;
  /** Effective CY Brand of each item code. */
  itemBrand: Int32Array;
}

const preparedCache = new WeakMap<Dataset, Prepared>();

/** Separator inside customer key values (`<CustomerID>␟<CustomerName>`). */
export const CUSTOMER_KEY_SEP = '\u241F';

export function normTx(s: string): TxType | null {
  const k = s.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (k === 'sales' || k === 'sale') return 'Sales';
  if (
    k === 'return sales' ||
    k === 'returns sales' ||
    k === 'return sale' ||
    k === 'sales return' ||
    k === 'sales returns'
  )
    return 'Return Sales';
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

  const availability = availabilityFromPeriods(periods);
  const cyYear = availability.years[availability.years.length - 1] ?? -Infinity;
  const rawLine = strCol(ds, 'Line');
  const rawBrand = strCol(ds, 'Brand');
  const item = strCol(ds, 'Item');

  const { lineOfItem, brandOfItem } = computeItemAllocations(
    n,
    periods,
    periodIdx,
    tx,
    cyYear,
    item,
    rawLine,
    rawBrand,
  );

  // Effective Line & Brand columns (remapped to the item's latest CY structure);
  // rows whose item has no CY Line allocation are excluded from the report (tx[i] = 0).
  const effLine = new Int32Array(n);
  const effBrand = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const it = item.codes[i];
    const l = lineOfItem[it];
    if (l > 0) {
      effLine[i] = l;
      effBrand[i] = brandOfItem[it] >= 0 ? brandOfItem[it] : rawBrand.codes[i];
    } else {
      tx[i] = 0;
    }
  }

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

  const p: Prepared = {
    ds,
    n,
    qty,
    val,
    periods,
    periodIdx,
    tx,
    c: {
      line: { kind: 'str', name: 'Line', dict: rawLine.dict, codes: effLine },
      brand: { kind: 'str', name: 'Brand', dict: rawBrand.dict, codes: effBrand },
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
    availability,
    customerInfo: info,
    itemLine: lineOfItem,
    itemBrand: brandOfItem,
  };
  preparedCache.set(ds, p);
  return p;
}

/**
 * Item-to-Line & Brand allocation from each item's latest period in the Current Year
 * (e.g. Sep 202609 first, falling back to earlier CY months such as 202608/202607 if the item had no Sep invoice).
 * Ties within that period -> value with most rows, then first seen.
 * Items that do not appear in any Line in CY get `lineOfItem[it] = -1` and are excluded from the report.
 */
function computeItemAllocations(
  n: number,
  date: number[],
  periodIdx: Uint16Array,
  tx: Uint8Array,
  cyYear: number,
  item: StrColumn,
  line: StrColumn,
  brand: StrColumn,
): { lineOfItem: Int32Array; brandOfItem: Int32Array } {
  const nItem = item.dict.length;
  const latestCy = new Float64Array(nItem).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    if (!tx[i]) continue;
    const it = item.codes[i];
    if (it === 0 || line.codes[i] === 0) continue;
    const d = date[periodIdx[i]];
    if (yearOf(d) === cyYear && d > latestCy[it]) {
      latestCy[it] = d;
    }
  }
  const lineCount = new Map<number, Map<number, number>>();
  const brandCount = new Map<number, Map<number, number>>();
  const bump = (m: Map<number, Map<number, number>>, it: number, k: number) => {
    let mm = m.get(it);
    if (!mm) m.set(it, (mm = new Map()));
    mm.set(k, (mm.get(k) ?? 0) + 1);
  };
  for (let i = 0; i < n; i++) {
    if (!tx[i]) continue;
    const it = item.codes[i];
    if (it === 0 || line.codes[i] === 0) continue;
    if (date[periodIdx[i]] === latestCy[it]) {
      bump(lineCount, it, line.codes[i]);
      bump(brandCount, it, brand.codes[i]);
    }
  }
  const pick = (m: Map<number, number> | undefined) => {
    let best = -1;
    let bestN = -1;
    if (m) for (const [k, cnt] of m) if (cnt > bestN) (best = k), (bestN = cnt);
    return best;
  };
  const lineOfItem = new Int32Array(nItem).fill(-1);
  const brandOfItem = new Int32Array(nItem).fill(-1);
  for (const [it, lm] of lineCount) {
    const l = pick(lm);
    if (l > 0) {
      lineOfItem[it] = l;
      brandOfItem[it] = Math.max(0, pick(brandCount.get(it)));
    }
  }
  return { lineOfItem, brandOfItem };
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
  const { line, brand, item, mainType, subType, distributor, territory, transactionType } = p.c;
  const excludedDistributors = new Set(EXCLUDED_DISTRIBUTORS.map((d) => d.trim().toLowerCase()));
  const triples = new Set<string>();
  const tripleList: [string, string, string][] = [];
  const channelPairs = new Set<string>();
  const channelList: [string, string][] = [];
  const lineUsed = new Uint8Array(line.dict.length);
  const mtUsed = new Uint8Array(mainType.dict.length);
  const stUsed = new Uint8Array(subType.dict.length);
  const distUsed = new Uint8Array(distributor.dict.length);
  const terrUsed = new Uint8Array(territory.dict.length);
  const txRows = new Int32Array(transactionType.dict.length);
  for (let i = 0; i < p.n; i++) {
    const it = item.codes[i];
    if (p.itemLine[it] <= 0) continue;
    const l = line.codes[i];
    const b = brand.codes[i];
    const mt = mainType.codes[i];
    const st = subType.codes[i];
    const d = distributor.codes[i];
    const tr = territory.codes[i];
    lineUsed[l] = 1;
    if (mt > 0) mtUsed[mt] = 1;
    if (st > 0) stUsed[st] = 1;
    if (d > 0 && !excludedDistributors.has(distributor.dict[d].trim().toLowerCase())) {
      distUsed[d] = 1;
    }
    if (tr > 0) terrUsed[tr] = 1;
    txRows[transactionType.codes[i]]++;
    if (mt > 0 && st > 0) {
      const chKey = `${mt}|${st}`;
      if (!channelPairs.has(chKey)) {
        channelPairs.add(chKey);
        channelList.push([mainType.dict[mt], subType.dict[st]]);
      }
    }
    const key = `${l}|${b}|${it}`;
    if (!triples.has(key)) {
      triples.add(key);
      tripleList.push([line.dict[l], brand.dict[b], item.dict[it]]);
    }
  }
  const used = (col: StrColumn, u: Uint8Array) => col.dict.filter((_, k) => k > 0 && u[k]).sort((a, b) => a.localeCompare(b));
  return {
    rowCount: p.n,
    columns: ds.columns.map((c) => c.name),
    availability: p.availability,
    lines: used(line, lineUsed),
    mainTypes: used(mainType, mtUsed),
    subTypes: used(subType, stUsed),
    distributors: used(distributor, distUsed),
    territories: used(territory, terrUsed),
    channels: channelList,
    products: tripleList,
    transactionTypes: transactionType.dict
      .map((name, k) => ({ name: name || UNASSIGNED_LABEL, rows: txRows[k], included: normTx(name) !== null }))
      .filter((t) => t.rows > 0),
  };
}

/** SubType options cascading from selected MainTypes (all SubTypes when empty). */
export function subTypeOptions(
  meta: Pick<DatasetMeta, 'subTypes' | 'channels'>,
  mainTypes: string[],
): string[] {
  if (!mainTypes.length) return meta.subTypes;
  const ms = new Set(mainTypes);
  const s = new Set<string>();
  for (const [mt, st] of meta.channels) {
    if (ms.has(mt)) s.add(st);
  }
  return [...s].sort((a, b) => a.localeCompare(b));
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
  Item: 'item',
};
const LEVEL_COL: Record<Level, keyof Prepared['c']> = {
  subtype: 'subType',
  distributor: 'distributor',
  chain: 'chain',
  territory: 'territory',
  brick: 'brick',
  customer: 'customer',
};

const sumsAt = (a: Float64Array, k: number): Sums => ({
  pyQ: a[k * 4],
  pyV: a[k * 4 + 1],
  cyQ: a[k * 4 + 2],
  cyV: a[k * 4 + 3],
});

type Masks = [Int32Array, Uint8Array][];

interface QueryContext {
  p: Prepared;
  period: ResolvedPeriod;
  /** Per period index: 0 = outside, 1 = PY, 2 = CY */
  pflag: Uint8Array;
  monthOfP: Int32Array;
  txAllowed: Uint8Array;
  /** Drill chip filters. */
  drillMasks: Masks;
  /** Channel & Market filters. */
  mtMask: Uint8Array | null;
  stMask: Uint8Array | null;
  distMask: Uint8Array | null;
  terrMask: Uint8Array | null;
  /** Product filters. */
  lineMask: Uint8Array | null;
  brandMask: Uint8Array | null;
  itemMask: Uint8Array | null;
  /** Combined global + product masks for analyzeItems. */
  globalMasks: Masks;
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

  const drillMasks: Masks = [];
  const byField = new Map<DrillField, string[]>();
  for (const chip of query.drill) byField.set(chip.field, [...(byField.get(chip.field) ?? []), chip.value]);
  for (const [field, values] of byField) {
    const col = c[DRILL_COL[field]];
    drillMasks.push([col.codes, mask(col, values)!]);
  }

  const mtMask = mask(c.mainType, query.mainTypes);
  const stMask = mask(c.subType, query.subTypes);
  const distMask = mask(c.distributor, query.distributors);
  const terrMask = mask(c.territory, query.territories);

  const globalMasks: Masks = [...drillMasks];
  if (mtMask) globalMasks.push([c.mainType.codes, mtMask]);
  if (stMask) globalMasks.push([c.subType.codes, stMask]);
  if (distMask) globalMasks.push([c.distributor.codes, distMask]);
  if (terrMask) globalMasks.push([c.territory.codes, terrMask]);

  const lineMask = query.line === null ? null : mask(c.line, [query.line]);
  const brandMask = mask(c.brand, query.brands);
  const itemMask = mask(c.item, query.items);

  const productMasks: Masks = [];
  if (lineMask) productMasks.push([c.line.codes, lineMask]);
  if (brandMask) productMasks.push([c.brand.codes, brandMask]);
  if (itemMask) productMasks.push([c.item.codes, itemMask]);

  return {
    p,
    period,
    pflag,
    monthOfP,
    txAllowed,
    drillMasks,
    mtMask,
    stMask,
    distMask,
    terrMask,
    lineMask,
    brandMask,
    itemMask,
    globalMasks,
    productMasks,
  };
}

interface LevelAcc {
  level: Level;
  col: StrColumn;
  acc: Float64Array;
  cnt: Int32Array;
}

function toContributionRow(
  r: GroupRow,
  totalSums: Sums,
): ContributionRow {
  const unitsDelta = r.sums.cyQ - r.sums.pyQ;
  const valueDelta = r.sums.cyV - r.sums.pyV;
  return {
    id: r.id,
    field: r.field,
    value: r.value,
    label: r.label,
    brand: r.brand,
    sums: r.sums,
    unitsDelta,
    valueDelta,
    unitsGrowth: growth(r.sums.pyQ, r.sums.cyQ),
    valueGrowth: growth(r.sums.pyV, r.sums.cyV),
    unitsShareCy: shareOfTotal(r.sums.cyQ, totalSums.cyQ),
    valueShareCy: shareOfTotal(r.sums.cyV, totalSums.cyV),
    unitsContribPp: contributionPp(unitsDelta, totalSums.pyQ),
    valueContribPp: contributionPp(valueDelta, totalSums.pyV),
    pvm: priceVolumeRow(r.sums, totalSums.pyV),
  };
}

export function analyze(ds: Dataset, query: AnalysisQuery): AnalysisResult {
  const ctx = buildContext(ds, query);
  const {
    p,
    period,
    pflag,
    monthOfP,
    txAllowed,
    drillMasks,
    mtMask,
    stMask,
    distMask,
    terrMask,
    lineMask,
    brandMask,
    itemMask,
  } = ctx;
  const c = p.c;

  const lineAcc = new Float64Array(c.line.dict.length * 4);
  const lineCnt = new Int32Array(c.line.dict.length);
  const monthAcc = new Float64Array(13 * 4);
  const nTerr = c.territory.dict.length;
  const terrMonthAcc = new Float64Array(nTerr * 13 * 4);
  const nItem = c.item.dict.length;
  const itemAcc = new Float64Array(nItem * 4);
  const itemCnt = new Int32Array(nItem);

  const mtUsed = new Uint8Array(c.mainType.dict.length);
  const stUsed = new Uint8Array(c.subType.dict.length);
  const distUsed = new Uint8Array(c.distributor.dict.length);
  const terrUsed = new Uint8Array(c.territory.dict.length);
  const brandUsed = new Uint8Array(c.brand.dict.length);
  const itemUsed = new Uint8Array(c.item.dict.length);

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
  const mtCodes = c.mainType.codes;
  const distCodes = c.distributor.codes;
  const brandCodes = c.brand.codes;
  const nChain = c.chain.dict.length;
  // Brick → territory weights
  const terrW = new Map<number, Map<number, number>>();
  const brickCodes = c.brick.codes;
  const terrCodes = c.territory.codes;
  const itemCodes = c.item.codes;

  const { qty, val, tx, periodIdx } = p;
  const lineCodes = c.line.codes;
  const nd = drillMasks.length;
  const nl = levelAccs.length;

  rows: for (let i = 0; i < p.n; i++) {
    if (!txAllowed[tx[i]]) continue;
    const pk = periodIdx[i];
    const f = pflag[pk];
    if (!f) continue;
    for (let j = 0; j < nd; j++) if (!drillMasks[j][1][drillMasks[j][0][i]]) continue rows;

    // Step 1a: MainType
    const mt = mtCodes[i];
    if (mt > 0) mtUsed[mt] = 1;
    if (mtMask && !mtMask[mt]) continue;

    // Step 1b: SubType (cascaded from MainType)
    const sg = subCodes[i];
    if (sg > 0) stUsed[sg] = 1;
    if (stMask && !stMask[sg]) continue;

    // Step 2a: Distributor (cascaded from Channel)
    const d = distCodes[i];
    if (d > 0) distUsed[d] = 1;
    if (distMask && !distMask[d]) continue;

    // Step 2b: Territory (cascaded from Channel + Distributor)
    const t = terrCodes[i];
    if (t > 0) terrUsed[t] = 1;
    if (terrMask && !terrMask[t]) continue;

    const q = qty[i];
    const v = val[i];
    const off = f === 2 ? 2 : 0;
    const l = lineCodes[i];
    lineAcc[l * 4 + off] += q;
    lineAcc[l * 4 + off + 1] += v;
    lineCnt[l]++;

    if (lineMask && !lineMask[l]) continue;

    // Step 3a: Brand (cascaded from Channel + Market)
    const b = brandCodes[i];
    if (b > 0) brandUsed[b] = 1;
    if (brandMask && !brandMask[b]) continue;

    // Step 3b: Item (cascaded from Channel + Market + Brand)
    const it = itemCodes[i];
    if (it > 0) itemUsed[it] = 1;
    if (itemMask && !itemMask[it]) continue;

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

    const tmIdx = (t * 13 + m) * 4 + off;
    terrMonthAcc[tmIdx] += q;
    terrMonthAcc[tmIdx + 1] += v;

    itemAcc[it * 4 + off] += q;
    itemAcc[it * 4 + off + 1] += v;
    itemCnt[it]++;

    for (let j = 0; j < nl; j++) {
      const la = levelAccs[j];
      const g = la.col.codes[i];
      la.acc[g * 4 + off] += q;
      la.acc[g * 4 + off + 1] += v;
      la.cnt[g]++;
    }
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
    tm.set(t, (tm.get(t) ?? 0) + Math.abs(v) + 1e-6);
  }

  const excludedDistributors = new Set(EXCLUDED_DISTRIBUTORS.map((d) => d.trim().toLowerCase()));
  const collectOpts = (
    col: StrColumn,
    usedArr: Uint8Array,
    selectedVals?: string[],
    excludeSet?: Set<string>,
  ): string[] => {
    const out = new Set<string>();
    for (let k = 1; k < col.dict.length; k++) {
      if (!usedArr[k]) continue;
      const v = col.dict[k];
      if (!v) continue;
      if (excludeSet && excludeSet.has(v.trim().toLowerCase())) continue;
      out.add(v);
    }
    if (selectedVals) {
      for (const v of selectedVals) {
        if (v && col.dict.includes(v) && (!excludeSet || !excludeSet.has(v.trim().toLowerCase()))) {
          out.add(v);
        }
      }
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  };

  const filterOptions: CascadingFilterOptions = {
    mainTypes: collectOpts(c.mainType, mtUsed, query.mainTypes),
    subTypes: collectOpts(c.subType, stUsed, query.subTypes),
    distributors: collectOpts(c.distributor, distUsed, query.distributors, excludedDistributors),
    territories: collectOpts(c.territory, terrUsed, query.territories),
    brands: collectOpts(c.brand, brandUsed, query.brands),
    items: collectOpts(c.item, itemUsed, query.items),
  };
  const levels = {} as Record<Level, GroupRow[]>;
  for (const { level, col, acc, cnt } of levelAccs) {
    const field = LEVEL_FIELD[level];
    const rowsOut: GroupRow[] = [];
    for (let g = 0; g < col.dict.length; g++) {
      if (!cnt[g]) continue;
      const value = col.dict[g];
      if (level === 'distributor' && excludedDistributors.has(value.trim().toLowerCase())) continue;
      if (level === 'chain' && (!value || value.trim() === '' || value === UNASSIGNED_LABEL || value === UNASSIGNED_CHAIN_LABEL)) continue;
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
        row.territoryOthers = [...tm.keys()]
          .filter((t) => t !== best)
          .map((t) => c.territory.dict[t] || UNASSIGNED_LABEL)
          .sort();
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

  // Build Territory × Month matrix
  const territoryAcc = levelAccs.find((la) => la.level === 'territory')!;
  const territoryMonths: TerritoryMonthRow[] = [];
  for (let t = 0; t < nTerr; t++) {
    if (!territoryAcc.cnt[t]) continue;
    const rawVal = c.territory.dict[t];
    const tMonths: MonthPoint[] = period.chartMonths.map((m) => ({
      month: m,
      label: MONTH_ABBR[m - 1],
      sums: sumsAt(terrMonthAcc, t * 13 + m),
    }));
    territoryMonths.push({
      territory: rawVal,
      label: rawVal || UNASSIGNED_LABEL,
      sums: sumsAt(territoryAcc.acc, t),
      months: tMonths,
    });
  }

  // Build Item rows & Phase 4 insights
  const itemRows: GroupRow[] = [];
  for (let k = 0; k < nItem; k++) {
    if (!itemCnt[k]) continue;
    const name = c.item.dict[k];
    const b = p.itemBrand[k];
    itemRows.push({
      id: `Item:${name}`,
      field: 'Item',
      value: name,
      label: name || UNASSIGNED_LABEL,
      sums: sumsAt(itemAcc, k),
      rowCount: itemCnt[k],
      brand: b >= 0 ? c.brand.dict[b] : undefined,
    });
  }

  const distTotals = sumRows(levels.distributor);
  const byLevel: Record<InsightLevel, ContributionRow[]> = {
    subtype: levels.subtype.map((r) => toContributionRow(r, totals)),
    distributor: levels.distributor.map((r) => toContributionRow(r, distTotals)),
    territory: levels.territory.map((r) => toContributionRow(r, totals)),
    brick: levels.brick.map((r) => toContributionRow(r, totals)),
    item: itemRows.map((r) => toContributionRow(r, totals)),
  };

  const pvmSummary = decomposePriceVolume(
    itemRows.map((r) => r.sums),
    totals,
  );

  const levelPvmSummary: Record<InsightLevel, PriceVolumeSummary> = {
    subtype: decomposePriceVolume(
      levels.subtype.map((r) => r.sums),
      totals,
    ),
    distributor: decomposePriceVolume(
      levels.distributor.map((r) => r.sums),
      distTotals,
    ),
    territory: decomposePriceVolume(
      levels.territory.map((r) => r.sums),
      totals,
    ),
    brick: decomposePriceVolume(
      levels.brick.map((r) => r.sums),
      totals,
    ),
    item: pvmSummary,
  };

  const insights: AnalysisInsights = {
    pvmSummary,
    levelPvmSummary,
    byLevel,
  };

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

  const months: MonthPoint[] = period.chartMonths.map((m) => ({
    month: m,
    label: MONTH_ABBR[m - 1],
    sums: sumsAt(monthAcc, m),
  }));

  return {
    period,
    totals,
    months,
    territoryMonths,
    insights,
    levels,
    filterOptions,
    lines,
    linesTotal,
    matchedRows: matched,
  };
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
