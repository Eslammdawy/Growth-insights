/**
 * npm run make-fixture -- [public/data/sales.json.gz | workbook.xlsx]
 *
 * Extracts a deterministic, stratified ~3k-row fixture into src/lib/__fixtures__/sample.json covering every
 * Line, SubType, both years, all transaction types (incl. returns), several Chains (incl. Private-with-chain
 * and null chain). Only the required columns are kept to keep the fixture small.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { REQUIRED_COLUMNS } from '../src/lib/config';
import { Dataset, decodeDataset, rowObject } from '../src/lib/columnar';
import { parseXlsx } from '../src/lib/parse';
import { fileSource } from './node-source';

const OUT = resolve('src/lib/__fixtures__/sample.json');
const TARGET = 3000;

async function load(path: string): Promise<Dataset> {
  if (path.endsWith('.xlsx')) {
    const src = await fileSource(path);
    try {
      return await parseXlsx(src);
    } finally {
      await src.close();
    }
  }
  return decodeDataset(JSON.parse(gunzipSync(await readFile(path)).toString('utf8')));
}

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  let input = process.argv[2];
  if (!input) {
    input = 'public/data/sales.json.gz';
    try {
      await access(input);
    } catch {
      input = '../HPG Sales_SalesPerDistributorCustomerLevel Q3-2026.xlsx';
    }
  }
  console.log(`Loading ${resolve(input)}`);
  const ds = await load(resolve(input));
  const col = (name: string) => {
    const c = ds.columns.find((x) => x.name === name)!;
    return (i: number) => (c.kind === 'str' ? c.dict[c.codes[i]] : c.values[i]);
  };
  const line = col('Line');
  const sub = col('SubType');
  const date = col('Date');
  const tt = col('TransactionType');
  const chain = col('Chain');

  const rand = rng(20261022);
  // Reservoir sampling per stratum
  const strata = new Map<string, { seen: number; picks: number[] }>();
  const K = 4;
  const addTo = (key: string, i: number, k: number) => {
    let s = strata.get(key);
    if (!s) strata.set(key, (s = { seen: 0, picks: [] }));
    s.seen++;
    if (s.picks.length < k) s.picks.push(i);
    else {
      const j = Math.floor(rand() * s.seen);
      if (j < k) s.picks[j] = i;
    }
  };
  for (let i = 0; i < ds.rowCount; i++) {
    const year = Math.floor((date(i) as number) / 100);
    addTo(`L|${line(i)}|${sub(i)}|${year}|${tt(i)}`, i, K);
    const st = sub(i) as string;
    const ch = chain(i) as string;
    if (st === 'Chain' || st === 'Private' || st === 'Ezzaby') addTo(`C|${st}|${ch}|${year}`, i, 2);
  }
  // Keep only a few chains per SubType (plus the null chain) to bound size
  const chainKeys = [...strata.keys()].filter((k) => k.startsWith('C|'));
  const bySub = new Map<string, string[]>();
  for (const k of chainKeys) {
    const st = k.split('|')[1];
    bySub.set(st, [...(bySub.get(st) ?? []), k]);
  }
  const picked = new Set<number>();
  for (const [k, s] of strata) if (k.startsWith('L|')) s.picks.forEach((i) => picked.add(i));
  for (const [, keys] of bySub) {
    const chains = [...new Set(keys.map((k) => k.split('|')[2]))].sort();
    const keep = new Set(['', ...chains.filter((c) => c).slice(0, 10)]);
    for (const k of keys) if (keep.has(k.split('|')[2])) strata.get(k)!.picks.forEach((i) => picked.add(i));
  }
  // Top up with random rows to reach the target size
  while (picked.size < TARGET) picked.add(Math.floor(rand() * ds.rowCount));

  const keepCols = [...REQUIRED_COLUMNS];
  const rows = [...picked]
    .sort((a, b) => a - b)
    .map((i) => {
      const o = rowObject(ds, i);
      const r: Record<string, string | number | null> = {};
      for (const c of keepCols) r[c] = o[c] === '' ? null : o[c];
      return r;
    });
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(rows, null, 0).replace(/\},\{/g, '},\n{'), 'utf8');
  const count = (f: (r: Record<string, unknown>) => unknown) => new Set(rows.map(f)).size;
  console.log(
    `Wrote ${rows.length} rows to ${OUT}\n  lines=${count((r) => r.Line)} subtypes=${count((r) => r.SubType)} chains=${count((r) => r.Chain)} ` +
      `txTypes=${count((r) => r.TransactionType)} periods=${count((r) => r.Date)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
