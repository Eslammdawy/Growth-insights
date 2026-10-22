/**
 * npm run convert -- [path/to/workbook.xlsx] [--out public/data/sales.json.gz]
 *
 * Streams the first worksheet of the workbook (never loading the full sheet XML) into the columnar,
 * dictionary-encoded JSON format and writes it gzipped. Prints per-year totals for validation.
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { createGzip, constants as zc } from 'node:zlib';
import { once } from 'node:events';
import { encodeDatasetChunks, numCol, strCol, Dataset } from '../src/lib/columnar';
import { parseXlsx } from '../src/lib/parse';
import { fileSource } from './node-source';

const DEFAULT_INPUT = '../HPG Sales_SalesPerDistributorCustomerLevel Q3-2026.xlsx';
const DEFAULT_OUTPUT = 'public/data/sales.json.gz';

function args() {
  const a = process.argv.slice(2);
  let input = DEFAULT_INPUT;
  let out = DEFAULT_OUTPUT;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--out' || a[i] === '-o') out = a[++i];
    else if (!a[i].startsWith('-')) input = a[i];
  }
  return { input: resolve(input), out: resolve(out) };
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
  const { input, out } = args();
  console.log(`Converting ${input}`);
  const t0 = Date.now();
  const src = await fileSource(input);
  let lastPct = -1;
  const ds = await parseXlsx(src, {
    onProgress: (p) => {
      const pct = Math.floor(p.ratio * 100);
      if (pct >= lastPct + 5 || p.phase === 'finalizing') {
        lastPct = pct;
        process.stdout.write(`  ${p.phase.padEnd(10)} ${String(pct).padStart(3)}%  rows=${p.rows.toLocaleString('en-US')}\n`);
      }
    },
  });
  await src.close();
  console.log(`Parsed ${ds.rowCount.toLocaleString('en-US')} rows × ${ds.columns.length} columns in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
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
  for (const piece of encodeDatasetChunks(ds, { source: basename(input) })) {
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
