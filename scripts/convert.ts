/**
 * npm run convert -- [path/to/workbook1.xlsx] [path/to/workbook2.xlsx] [--out public/data/sales.json.gz]
 *
 * Streams multiple worksheets into a unified columnar, dictionary-encoded JSON format
 * filtered to REQUIRED_COLUMNS, excludes unsupported transaction types (Bonus / Return Bonus),
 * rounds Quantity & Value to 4 decimal places, sorts rows Item-first for gzip compression,
 * and writes it gzipped. Prints per-year totals and net sales for validation.
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { createGzip, constants as zc } from 'node:zlib';
import { once } from 'node:events';
import {
  Column,
  StrColumn,
  encodeDatasetChunks,
  numCol,
  strCol,
  Dataset,
  ColumnarBuilder,
  canonicalHeader,
  validateDataset,
  DataError,
} from '../src/lib/columnar';
import { normTx } from '../src/lib/aggregate';
import { readZipDirectory, findFirstSheet, streamZipText, parseSharedStrings, SheetScanner } from '../src/lib/parse';
import { REQUIRED_COLUMNS } from '../src/lib/config';
import { fileSource } from './node-source';

const DEFAULT_INPUTS = [
  '../HPG Sales_SalesPerDistributor Py 2025.xlsx',
  '../HPG Sales_SalesPerDistributor Cy 2026.xlsx',
];
const DEFAULT_OUTPUT = 'public/data/sales.json.gz';

function args() {
  const a = process.argv.slice(2);
  const inputs: string[] = [];
  let out = DEFAULT_OUTPUT;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--out' || a[i] === '-o') {
      out = a[++i];
    } else if (!a[i].startsWith('-')) {
      inputs.push(a[i]);
    }
  }
  const resolvedInputs = (inputs.length > 0 ? inputs : DEFAULT_INPUTS).map((f) => resolve(f));
  return { inputs: resolvedInputs, out: resolve(out) };
}

export function totalsByYearAndType(ds: Dataset) {
  const date = numCol(ds, 'Date').values;
  const q = numCol(ds, 'Quantity').values;
  const v = numCol(ds, 'Value').values;
  const tt = strCol(ds, 'TransactionType');
  const out = new Map<string, { year: number; type: string; rows: number; qty: number; value: number }>();
  for (let i = 0; i < ds.rowCount; i++) {
    const year = Math.floor(date[i] / 100);
    const type = tt.dict[tt.codes[i]];
    const k = `${year}|${type}`;
    let e = out.get(k);
    if (!e) out.set(k, (e = { year, type, rows: 0, qty: 0, value: 0 }));
    e.rows++;
    e.qty += q[i] || 0;
    e.value += v[i] || 0;
  }
  return [...out.values()].sort((a, b) => a.year - b.year || a.type.localeCompare(b.type));
}

/** Rounds numeric metrics to 4 decimals and normalizes -0 to 0 to trim JSON float tails. */
export function round4(v: number): number {
  if (!Number.isFinite(v)) return v;
  const r = Math.round(v * 10_000) / 10_000;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Keeps strictly REQUIRED_COLUMNS, drops unsupported transaction types (Bonus / Return Bonus),
 * rounds Quantity & Value to 4 decimal places, sorts rows Item-first for gzip locality, and
 * compacts unused dictionary entries while preserving dict[0] === ''.
 */
export function optimizeDataset(ds: Dataset): Dataset {
  validateDataset(ds);

  const date = numCol(ds, 'Date').values;
  const qty = numCol(ds, 'Quantity').values;
  const val = numCol(ds, 'Value').values;
  const tt = strCol(ds, 'TransactionType');
  const line = strCol(ds, 'Line');
  const brand = strCol(ds, 'Brand');
  const item = strCol(ds, 'Item');
  const dist = strCol(ds, 'Distributor');
  const mt = strCol(ds, 'MainType');
  const st = strCol(ds, 'SubType');
  const chain = strCol(ds, 'Chain');
  const terr = strCol(ds, 'Territory');
  const brick = strCol(ds, 'Brick');
  const custId = strCol(ds, 'CustomerID');
  const custName = strCol(ds, 'CustomerName');

  const activeTx = new Uint8Array(tt.dict.length);
  for (let k = 0; k < tt.dict.length; k++) {
    if (normTx(tt.dict[k]) !== null) activeTx[k] = 1;
  }

  const activeIdx: number[] = [];
  for (let i = 0; i < ds.rowCount; i++) {
    if (activeTx[tt.codes[i]]) activeIdx.push(i);
  }
  if (activeIdx.length === 0) {
    throw new DataError(
      'empty',
      'No Sales or Return Sales rows remain after excluding unsupported transaction types.',
    );
  }

  const roundedQty = new Float64Array(ds.rowCount);
  const roundedVal = new Float64Array(ds.rowCount);
  for (let i = 0; i < activeIdx.length; i++) {
    const idx = activeIdx[i];
    roundedQty[idx] = round4(qty[idx]);
    roundedVal[idx] = round4(val[idx]);
  }

  const numCmp = (x: number, y: number) => {
    const nx = Number.isNaN(x);
    const ny = Number.isNaN(y);
    if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1;
    return x - y;
  };

  activeIdx.sort(
    (a, b) =>
      date[a] - date[b] ||
      tt.codes[a] - tt.codes[b] ||
      line.codes[a] - line.codes[b] ||
      brand.codes[a] - brand.codes[b] ||
      item.codes[a] - item.codes[b] ||
      dist.codes[a] - dist.codes[b] ||
      mt.codes[a] - mt.codes[b] ||
      st.codes[a] - st.codes[b] ||
      chain.codes[a] - chain.codes[b] ||
      terr.codes[a] - terr.codes[b] ||
      brick.codes[a] - brick.codes[b] ||
      numCmp(roundedQty[a], roundedQty[b]) ||
      custId.codes[a] - custId.codes[b] ||
      custName.codes[a] - custName.codes[b] ||
      a - b,
  );

  const outCount = activeIdx.length;
  const strCols: Record<string, StrColumn> = {
    Line: line,
    Brand: brand,
    Item: item,
    MainType: mt,
    SubType: st,
    Brick: brick,
    Territory: terr,
    Chain: chain,
    CustomerID: custId,
    CustomerName: custName,
    Distributor: dist,
    TransactionType: tt,
  };

  const columns: Column[] = REQUIRED_COLUMNS.map((name): Column => {
    if (name === 'Date') {
      const values = new Float64Array(outCount);
      for (let i = 0; i < outCount; i++) values[i] = date[activeIdx[i]];
      return { kind: 'num', name, values };
    }
    if (name === 'Quantity') {
      const values = new Float64Array(outCount);
      for (let i = 0; i < outCount; i++) values[i] = roundedQty[activeIdx[i]];
      return { kind: 'num', name, values };
    }
    if (name === 'Value') {
      const values = new Float64Array(outCount);
      for (let i = 0; i < outCount; i++) values[i] = roundedVal[activeIdx[i]];
      return { kind: 'num', name, values };
    }

    const col = strCols[name] ?? strCol(ds, name);
    const used = new Uint8Array(col.dict.length);
    used[0] = 1;
    for (let i = 0; i < outCount; i++) used[col.codes[activeIdx[i]]] = 1;

    const dict: string[] = [''];
    const remap = new Int32Array(col.dict.length);
    for (let k = 1; k < col.dict.length; k++) {
      if (used[k]) {
        remap[k] = dict.length;
        dict.push(col.dict[k]);
      }
    }

    const codes = new Int32Array(outCount);
    for (let i = 0; i < outCount; i++) codes[i] = remap[col.codes[activeIdx[i]]];
    return { kind: 'str', name, dict, codes };
  });

  return { rowCount: outCount, columns, source: ds.source };
}

async function main() {
  const { inputs, out } = args();
  console.log(`Starting conversion with ${inputs.length} input file(s):`);
  for (const input of inputs) {
    console.log(`  - ${input}`);
  }
  console.log(`Target output: ${out}\n`);

  const t0 = Date.now();
  const targetColumns = [...REQUIRED_COLUMNS];
  const builder = new ColumnarBuilder(targetColumns);

  for (let fIdx = 0; fIdx < inputs.length; fIdx++) {
    const input = inputs[fIdx];
    const name = basename(input);
    console.log(`[${fIdx + 1}/${inputs.length}] Converting ${name}...`);
    const tFile0 = Date.now();
    const src = await fileSource(input);
    const entries = await readZipDirectory(src);
    const sheetPath = await findFirstSheet(src, entries);
    const sheetEntry = entries.get(sheetPath)!;
    const sstEntry = entries.get('xl/sharedStrings.xml');

    let sst: string[] = [];
    if (sstEntry) {
      console.log(`  Parsing shared strings...`);
      sst = await parseSharedStrings(streamZipText(src, sstEntry));
      console.log(`  Loaded ${sst.length.toLocaleString('en-US')} shared strings`);
    }

    let colMap: number[] | null = null;
    let fileRows = 0;
    let lastReport = Date.now();

    const scanner = new SheetScanner(sst, (cells) => {
      if (!colMap) {
        const fileHeaders = cells.map((c) => canonicalHeader(c ?? ''));
        const missing = REQUIRED_COLUMNS.filter((req) => !fileHeaders.includes(req));
        if (missing.length) {
          throw new DataError('missing-columns', `File "${name}" is missing required column(s): ${missing.join(', ')}`);
        }
        colMap = targetColumns.map((target) => fileHeaders.indexOf(target));
        return;
      }

      const row = new Array(targetColumns.length);
      for (let j = 0; j < targetColumns.length; j++) {
        const srcIdx = colMap[j];
        row[j] = srcIdx >= 0 && srcIdx < cells.length ? cells[srcIdx] : undefined;
      }
      builder.addRow(row);
      fileRows++;

      const now = Date.now();
      if (now - lastReport > 2000) {
        lastReport = now;
        process.stdout.write(`  Processed ${fileRows.toLocaleString('en-US')} rows...\r`);
      }
    });

    for await (const chunk of streamZipText(src, sheetEntry)) {
      scanner.push(chunk);
    }
    scanner.end();
    await src.close();
    console.log(`  Finished ${name}: ${fileRows.toLocaleString('en-US')} rows in ${((Date.now() - tFile0) / 1000).toFixed(1)}s`);
  }

  const ds = builder.finish();
  console.log(`\nParsed total ${ds.rowCount.toLocaleString('en-US')} rows × ${ds.columns.length} columns in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  validateDataset(ds);

  for (const c of ds.columns) {
    console.log(`  ${c.name.padEnd(20)} ${c.kind === 'str' ? `text, ${c.dict.length - 1} distinct` : 'numeric'}`);
  }

  console.log('\nTotals by year and transaction type:');
  const rows = totalsByYearAndType(ds);
  for (const r of rows) {
    console.log(
      `  ${r.year}  ${r.type.padEnd(14)} rows=${String(r.rows).padStart(7)}  qty=${r.qty.toFixed(3).padStart(16)}  value=${r.value.toFixed(3).padStart(18)}`,
    );
  }
  const years = [...new Set(rows.map((r) => r.year))];
  console.log('\nNet sales (Sales + Return Sales, raw):');
  for (const y of years) {
    const s = rows.filter((r) => r.year === y && normTx(r.type) !== null);
    const qty = s.reduce((a, r) => a + r.qty, 0);
    const value = s.reduce((a, r) => a + r.value, 0);
    console.log(`  ${y}  qty=${qty.toFixed(3)}  value=${value.toFixed(3)}`);
  }

  const optimized = optimizeDataset(ds);
  validateDataset(optimized);
  const droppedRows = ds.rowCount - optimized.rowCount;
  console.log(
    `\nOptimized output: dropped ${droppedRows.toLocaleString('en-US')} unsupported row(s); exporting ${optimized.rowCount.toLocaleString('en-US')} rows × ${optimized.columns.length} columns`,
  );
  const optRows = totalsByYearAndType(optimized);
  const optYears = [...new Set(optRows.map((r) => r.year))];
  console.log('Net sales after optimization (4-decimal rounded):');
  for (const y of optYears) {
    const s = optRows.filter((r) => r.year === y);
    const qty = s.reduce((a, r) => a + r.qty, 0);
    const value = s.reduce((a, r) => a + r.value, 0);
    console.log(`  ${y}  qty=${qty.toFixed(3)}  value=${value.toFixed(3)}`);
  }

  await mkdir(dirname(out), { recursive: true });
  const gz = createGzip({ level: zc.Z_BEST_COMPRESSION });
  const file = createWriteStream(out);
  gz.pipe(file);
  const sourceLabel = `HPG Sales (${(optYears.length ? optYears : years).join(', ') || '2025-2026'})`;
  for (const piece of encodeDatasetChunks(optimized, { source: sourceLabel })) {
    if (!gz.write(piece)) await once(gz, 'drain');
  }
  gz.end();
  await once(file, 'finish');
  const { size } = await (await import('node:fs/promises')).stat(out);
  console.log(`\nWrote ${out} (${(size / 1024 / 1024).toFixed(2)} MB) in ${((Date.now() - t0) / 1000).toFixed(1)}s total`);
}

const isMain = process.argv[1] && /convert\.(ts|js|mjs)$/.test(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e instanceof Error ? `${e.name}: ${e.message}\n${(e as { details?: string[] }).details?.join('\n') ?? ''}` : e);
    process.exit(1);
  });
}
