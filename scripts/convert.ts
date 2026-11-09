/**
 * npm run convert -- [path/to/workbook1.xlsx] [path/to/workbook2.xlsx] [--out public/data/sales.json.gz]
 *
 * Streams multiple worksheets into a unified columnar, dictionary-encoded JSON format
 * filtered to the standard known dashboard columns, and writes it gzipped.
 * Prints per-year totals and net sales for validation.
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { createGzip, constants as zc } from 'node:zlib';
import { once } from 'node:events';
import {
  encodeDatasetChunks,
  numCol,
  strCol,
  Dataset,
  ColumnarBuilder,
  canonicalHeader,
  validateDataset,
  DataError,
} from '../src/lib/columnar';
import { readZipDirectory, findFirstSheet, streamZipText, parseSharedStrings, SheetScanner } from '../src/lib/parse';
import { KNOWN_COLUMNS, REQUIRED_COLUMNS } from '../src/lib/config';
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

async function main() {
  const { inputs, out } = args();
  console.log(`Starting conversion with ${inputs.length} input file(s):`);
  for (const input of inputs) {
    console.log(`  - ${input}`);
  }
  console.log(`Target output: ${out}\n`);

  const t0 = Date.now();
  const targetColumns = [...KNOWN_COLUMNS];
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
  console.log('\nNet sales (Sales + Return Sales):');
  for (const y of years) {
    const s = rows.filter((r) => r.year === y && (r.type === 'Sales' || r.type === 'Return Sales'));
    const qty = s.reduce((a, r) => a + r.qty, 0);
    const value = s.reduce((a, r) => a + r.value, 0);
    console.log(`  ${y}  qty=${qty.toFixed(3)}  value=${value.toFixed(3)}`);
  }

  await mkdir(dirname(out), { recursive: true });
  const gz = createGzip({ level: zc.Z_BEST_COMPRESSION });
  const file = createWriteStream(out);
  gz.pipe(file);
  const sourceLabel = `HPG Sales (${years.join(', ') || '2025-2026'})`;
  for (const piece of encodeDatasetChunks(ds, { source: sourceLabel })) {
    if (!gz.write(piece)) await once(gz, 'drain');
  }
  gz.end();
  await once(file, 'finish');
  const { size } = await (await import('node:fs/promises')).stat(out);
  console.log(`\nWrote ${out} (${(size / 1024 / 1024).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(1)}s total`);
}

const isMain = process.argv[1] && /convert\.(ts|js|mjs)$/.test(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e instanceof Error ? `${e.name}: ${e.message}\n${(e as { details?: string[] }).details?.join('\n') ?? ''}` : e);
    process.exit(1);
  });
}
