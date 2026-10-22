/**
 * Columnar, dictionary-encoded dataset representation.
 *
 * - Text columns: `dict` (unique values, index 0 is always the empty string = "unassigned") + `codes` (Int32Array).
 * - Numeric columns: Float64Array.
 *
 * The same structure is serialised to JSON (`sales.json.gz`) by the converter script and decoded in the browser.
 */
import { KNOWN_COLUMNS, NUMERIC_COLUMNS, REQUIRED_COLUMNS } from './config';

export interface StrColumn {
  kind: 'str';
  name: string;
  dict: string[];
  codes: Int32Array;
}
export interface NumColumn {
  kind: 'num';
  name: string;
  values: Float64Array;
}
export type Column = StrColumn | NumColumn;

export interface Dataset {
  rowCount: number;
  columns: Column[];
}

export type DataErrorKind = 'missing-columns' | 'bad-date' | 'empty' | 'format';

export class DataError extends Error {
  kind: DataErrorKind;
  details: string[];
  constructor(kind: DataErrorKind, message: string, details: string[] = []) {
    super(message);
    this.name = 'DataError';
    this.kind = kind;
    this.details = details;
  }
}

export const FORMAT_ID = 'sga-columnar';
export const FORMAT_VERSION = 1;

const canonicalByKey = new Map<string, string>(
  KNOWN_COLUMNS.map((c) => [c.toLowerCase().replace(/[\s_]/g, ''), c]),
);

/** Map a raw header (any case / spacing) to the canonical column name when it is a known column. */
export function canonicalHeader(raw: string): string {
  const t = (raw ?? '').trim();
  return canonicalByKey.get(t.toLowerCase().replace(/[\s_]/g, '')) ?? t;
}

export function normalizeText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function parseNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s === '') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

class GrowableInt32 {
  buf = new Int32Array(1024);
  len = 0;
  push(v: number) {
    if (this.len === this.buf.length) {
      const nb = new Int32Array(this.buf.length * 2);
      nb.set(this.buf);
      this.buf = nb;
    }
    this.buf[this.len++] = v;
  }
  finish() {
    return this.buf.slice(0, this.len);
  }
}
class GrowableFloat64 {
  buf = new Float64Array(1024);
  len = 0;
  push(v: number) {
    if (this.len === this.buf.length) {
      const nb = new Float64Array(this.buf.length * 2);
      nb.set(this.buf);
      this.buf = nb;
    }
    this.buf[this.len++] = v;
  }
  finish() {
    return this.buf.slice(0, this.len);
  }
}

interface StrBuilder {
  kind: 'str';
  name: string;
  dict: string[];
  index: Map<string, number>;
  codes: GrowableInt32;
}
interface NumBuilder {
  kind: 'num';
  name: string;
  values: GrowableFloat64;
}

/**
 * Incrementally builds a {@link Dataset} from rows of raw cell values (aligned with `headers`).
 * Used by the Node converter, the browser .xlsx worker and the test fixtures.
 */
export class ColumnarBuilder {
  readonly names: string[];
  private cols: (StrBuilder | NumBuilder | null)[];
  rowCount = 0;

  constructor(headers: string[], numericColumns: readonly string[] = NUMERIC_COLUMNS) {
    const seen = new Set<string>();
    this.names = headers.map((h) => canonicalHeader(h));
    this.cols = this.names.map((name) => {
      if (!name || seen.has(name)) return null; // blank or duplicate header -> skipped
      seen.add(name);
      if (numericColumns.includes(name)) return { kind: 'num', name, values: new GrowableFloat64() };
      return { kind: 'str', name, dict: [''], index: new Map([['', 0]]), codes: new GrowableInt32() };
    });
  }

  /** Add one row. `cells[i]` belongs to `headers[i]`; missing cells are treated as empty. */
  addRow(cells: ArrayLike<unknown>) {
    const cols = this.cols;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!c) continue;
      const raw = i < cells.length ? cells[i] : undefined;
      if (c.kind === 'num') {
        c.values.push(parseNumber(raw));
      } else {
        const s = normalizeText(raw);
        let code = c.index.get(s);
        if (code === undefined) {
          code = c.dict.length;
          c.dict.push(s);
          c.index.set(s, code);
        }
        c.codes.push(code);
      }
    }
    this.rowCount++;
  }

  finish(): Dataset {
    const columns: Column[] = [];
    for (const c of this.cols) {
      if (!c) continue;
      if (c.kind === 'num') columns.push({ kind: 'num', name: c.name, values: c.values.finish() });
      else columns.push({ kind: 'str', name: c.name, dict: c.dict, codes: c.codes.finish() });
    }
    return { rowCount: this.rowCount, columns };
  }
}

/** Build a dataset from plain row objects (fixtures, tests). */
export function datasetFromRows(rows: Record<string, unknown>[], headers?: string[]): Dataset {
  const hs = headers ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const b = new ColumnarBuilder(hs);
  const cells: unknown[] = new Array(hs.length);
  for (const r of rows) {
    for (let i = 0; i < hs.length; i++) cells[i] = r[hs[i]];
    b.addRow(cells);
  }
  return b.finish();
}

export function findColumn(ds: Dataset, name: string): Column | undefined {
  return ds.columns.find((c) => c.name === name);
}
export function strCol(ds: Dataset, name: string): StrColumn {
  const c = findColumn(ds, name);
  if (!c) throw new DataError('missing-columns', `Missing column: ${name}`, [name]);
  if (c.kind !== 'str') {
    // Numeric column requested as text: build a dictionary on the fly.
    const dict: string[] = [''];
    const index = new Map<string, number>([['', 0]]);
    const codes = new Int32Array(c.values.length);
    for (let i = 0; i < c.values.length; i++) {
      const s = Number.isNaN(c.values[i]) ? '' : String(c.values[i]);
      let k = index.get(s);
      if (k === undefined) {
        k = dict.length;
        dict.push(s);
        index.set(s, k);
      }
      codes[i] = k;
    }
    return { kind: 'str', name, dict, codes };
  }
  return c;
}
export function numCol(ds: Dataset, name: string): NumColumn {
  const c = findColumn(ds, name);
  if (!c) throw new DataError('missing-columns', `Missing column: ${name}`, [name]);
  if (c.kind !== 'num') {
    const values = new Float64Array(c.codes.length);
    for (let i = 0; i < c.codes.length; i++) values[i] = parseNumber(c.dict[c.codes[i]]);
    return { kind: 'num', name, values };
  }
  return c;
}

/** Valid YYYYMM between 1900-01 and 2999-12. */
export function isValidYyyymm(v: number): boolean {
  if (!Number.isInteger(v)) return false;
  const y = Math.floor(v / 100);
  const m = v % 100;
  return y >= 1900 && y <= 2999 && m >= 1 && m <= 12;
}

/** Throws a {@link DataError} for missing columns, invalid dates or empty data. */
export function validateDataset(ds: Dataset): void {
  const names = new Set(ds.columns.map((c) => c.name));
  const missing = REQUIRED_COLUMNS.filter((c) => !names.has(c));
  if (missing.length) {
    throw new DataError(
      'missing-columns',
      `The data is missing ${missing.length} required column(s): ${missing.join(', ')}`,
      [...missing],
    );
  }
  if (ds.rowCount === 0) throw new DataError('empty', 'The file contains a header row but no data rows.');
  const date = numCol(ds, 'Date').values;
  const bad: string[] = [];
  let badCount = 0;
  for (let i = 0; i < date.length; i++) {
    if (!isValidYyyymm(date[i])) {
      badCount++;
      if (bad.length < 5) bad.push(`row ${i + 2}: ${Number.isNaN(date[i]) ? '(not a number)' : date[i]}`);
    }
  }
  if (badCount) {
    throw new DataError(
      'bad-date',
      `${badCount.toLocaleString('en-US')} row(s) have a Date that is not in numeric YYYYMM format (e.g. 202607).`,
      bad,
    );
  }
}

export interface EncodeMeta {
  source?: string;
  createdAt?: string;
}

/** Serialise to JSON in pieces (so very large datasets never become a single giant string in the converter). */
export function* encodeDatasetChunks(ds: Dataset, meta: EncodeMeta = {}): Generator<string> {
  yield `{"format":${JSON.stringify(FORMAT_ID)},"version":${FORMAT_VERSION},"rowCount":${ds.rowCount}`;
  yield `,"source":${JSON.stringify(meta.source ?? '')},"createdAt":${JSON.stringify(meta.createdAt ?? new Date().toISOString())},"columns":[`;
  const BLOCK = 50_000;
  for (let ci = 0; ci < ds.columns.length; ci++) {
    const c = ds.columns[ci];
    yield `${ci ? ',' : ''}{"name":${JSON.stringify(c.name)},"type":"${c.kind}"`;
    if (c.kind === 'str') {
      yield `,"dict":${JSON.stringify(c.dict)},"codes":[`;
      for (let i = 0; i < c.codes.length; i += BLOCK) {
        yield (i ? ',' : '') + Array.prototype.join.call(c.codes.subarray(i, i + BLOCK), ',');
      }
    } else {
      yield `,"values":[`;
      for (let i = 0; i < c.values.length; i += BLOCK) {
        const part = c.values.subarray(i, i + BLOCK);
        let s = '';
        for (let j = 0; j < part.length; j++) {
          const v = part[j];
          s += (i + j ? ',' : '') + (Number.isFinite(v) ? String(v) : 'null');
        }
        yield s;
      }
    }
    yield ']}';
  }
  yield ']}';
}

export function encodeDataset(ds: Dataset, meta: EncodeMeta = {}): string {
  return Array.from(encodeDatasetChunks(ds, meta)).join('');
}

/** Decode the parsed JSON object produced by {@link encodeDataset}. */
export function decodeDataset(obj: unknown): Dataset {
  const o = obj as {
    format?: string;
    rowCount?: number;
    columns?: { name: string; type: string; dict?: string[]; codes?: number[]; values?: (number | null)[] }[];
  };
  if (!o || o.format !== FORMAT_ID || !Array.isArray(o.columns) || typeof o.rowCount !== 'number') {
    throw new DataError('format', 'This file is not a converted Sales Growth Analyzer dataset (.json.gz).');
  }
  const rowCount = o.rowCount;
  const columns: Column[] = o.columns.map((c) => {
    if (c.type === 'str') {
      const codes = Int32Array.from(c.codes ?? []);
      if (codes.length !== rowCount) throw new DataError('format', `Column ${c.name} has ${codes.length} rows, expected ${rowCount}.`);
      return { kind: 'str', name: c.name, dict: (c.dict ?? ['']).map(String), codes };
    }
    const values = new Float64Array(rowCount);
    const src = c.values ?? [];
    if (src.length !== rowCount) throw new DataError('format', `Column ${c.name} has ${src.length} rows, expected ${rowCount}.`);
    for (let i = 0; i < rowCount; i++) values[i] = src[i] === null ? NaN : (src[i] as number);
    return { kind: 'num', name: c.name, values };
  });
  return { rowCount, columns };
}

/** Transferable buffers of a dataset (for postMessage). */
export function datasetTransferables(ds: Dataset): ArrayBuffer[] {
  return ds.columns.map((c) => (c.kind === 'str' ? c.codes.buffer : c.values.buffer) as ArrayBuffer);
}

/** Decode a single row back into an object (debugging / tests). */
export function rowObject(ds: Dataset, i: number): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const c of ds.columns) out[c.name] = c.kind === 'str' ? c.dict[c.codes[i]] : c.values[i];
  return out;
}
