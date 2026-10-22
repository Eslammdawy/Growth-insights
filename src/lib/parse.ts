/**
 * Streaming .xlsx reader that never holds the (potentially huge) sheet XML in memory.
 *
 * - Reads the ZIP central directory via random access (so entry order inside the archive doesn't matter:
 *   shared strings are parsed before the sheet even when stored after it).
 * - Inflates each entry incrementally with fflate and decodes text with a streaming TextDecoder.
 * - Parses rows with a chunked regex scanner (process up to the last complete `</row>`, keep the remainder).
 *
 * Works in Node (converter) and in a browser Web Worker (upload).
 */
import { Inflate } from 'fflate';
import { ColumnarBuilder, DataError, Dataset, validateDataset } from './columnar';

export interface RandomAccessSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export interface ParseProgress {
  phase: 'directory' | 'strings' | 'sheet' | 'finalizing';
  /** 0..1 within the whole parse */
  ratio: number;
  rows: number;
}

export function blobSource(blob: Blob): RandomAccessSource {
  return {
    size: blob.size,
    async read(offset, length) {
      return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
    },
  };
}

export function bytesSource(bytes: Uint8Array): RandomAccessSource {
  return {
    size: bytes.length,
    async read(offset, length) {
      return bytes.subarray(offset, Math.min(bytes.length, offset + length));
    },
  };
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b: Uint8Array, o: number) => u32(b, o) + u32(b, o + 4) * 2 ** 32;

export async function readZipDirectory(src: RandomAccessSource): Promise<Map<string, ZipEntry>> {
  const tailLen = Math.min(src.size, 65557 + 20);
  const tail = await src.read(src.size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new DataError('format', 'Not a valid .xlsx file (ZIP directory not found).');
  let count = u16(tail, eocd + 10);
  let cdSize = u32(tail, eocd + 12);
  let cdOffset = u32(tail, eocd + 16);
  if (cdOffset === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && u32(tail, loc) === 0x07064b50) {
      const z64Off = u64(tail, loc + 8);
      const z = await src.read(z64Off, 56);
      count = u64(z, 32);
      cdSize = u64(z, 40);
      cdOffset = u64(z, 48);
    }
  }
  const cd = await src.read(cdOffset, cdSize);
  const entries = new Map<string, ZipEntry>();
  const dec = new TextDecoder();
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.length; n++) {
    if (u32(cd, p) !== 0x02014b50) break;
    const method = u16(cd, p + 10);
    let compressedSize = u32(cd, p + 20);
    let uncompressedSize = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    let localHeaderOffset = u32(cd, p + 42);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));
    // Zip64 extra field
    let e = p + 46 + nameLen;
    const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = u16(cd, e);
      const sz = u16(cd, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (uncompressedSize === 0xffffffff) (uncompressedSize = u64(cd, q)), (q += 8);
        if (compressedSize === 0xffffffff) (compressedSize = u64(cd, q)), (q += 8);
        if (localHeaderOffset === 0xffffffff) localHeaderOffset = u64(cd, q);
      }
      e += 4 + sz;
    }
    entries.set(name, { name, method, compressedSize, uncompressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Stream the decompressed bytes of a ZIP entry. `onCompressed` reports compressed bytes consumed. */
export async function* streamZipEntry(
  src: RandomAccessSource,
  entry: ZipEntry,
  onCompressed?: (done: number, total: number) => void,
  chunkSize = 1 << 20,
): AsyncGenerator<Uint8Array> {
  const lh = await src.read(entry.localHeaderOffset, 30);
  if (u32(lh, 0) !== 0x04034b50) throw new DataError('format', `Corrupt ZIP entry: ${entry.name}`);
  const start = entry.localHeaderOffset + 30 + u16(lh, 26) + u16(lh, 28);
  const end = start + entry.compressedSize;
  if (entry.method !== 0 && entry.method !== 8) {
    throw new DataError('format', `Unsupported ZIP compression method ${entry.method} for ${entry.name}`);
  }
  const queue: Uint8Array[] = [];
  const inflater = entry.method === 8 ? new Inflate((chunk) => queue.push(chunk)) : null;
  for (let off = start; off < end; off += chunkSize) {
    const len = Math.min(chunkSize, end - off);
    const data = await src.read(off, len);
    const final = off + len >= end;
    if (inflater) inflater.push(data, final);
    else queue.push(data);
    onCompressed?.(off + len - start, entry.compressedSize);
    while (queue.length) yield queue.shift()!;
  }
  if (entry.compressedSize === 0 && inflater) {
    inflater.push(new Uint8Array(0), true);
    while (queue.length) yield queue.shift()!;
  }
}

export async function* streamZipText(
  src: RandomAccessSource,
  entry: ZipEntry,
  onCompressed?: (done: number, total: number) => void,
): AsyncGenerator<string> {
  const dec = new TextDecoder('utf-8');
  for await (const bytes of streamZipEntry(src, entry, onCompressed)) {
    const s = dec.decode(bytes, { stream: true });
    if (s) yield s;
  }
  const rest = dec.decode();
  if (rest) yield rest;
}

async function readZipText(src: RandomAccessSource, entry: ZipEntry): Promise<string> {
  let s = '';
  for await (const part of streamZipText(src, entry)) s += part;
  return s;
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeXml(s: string): string {
  if (s.indexOf('&') < 0 && s.indexOf('_x') < 0) return s;
  let out = s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITY[e];
  });
  // OOXML escapes control characters as _xHHHH_
  if (out.indexOf('_x') >= 0) out = out.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  return out;
}

const T_RE = /<t(?:\s[^>]*)?>([^<]*)<\/t>/g;
function textOfRuns(inner: string): string {
  if (inner.indexOf('<rPh') >= 0) inner = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let s = '';
  T_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = T_RE.exec(inner))) s += m[1];
  return decodeXml(s);
}

/** Parse sharedStrings.xml from a stream of text chunks. */
export async function parseSharedStrings(chunks: AsyncIterable<string> | Iterable<string>): Promise<string[]> {
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>|<si\/>/g;
  let buf = '';
  const flush = (text: string) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push(m[1] === undefined ? '' : textOfRuns(m[1]));
  };
  for await (const chunk of chunks as AsyncIterable<string>) {
    buf += chunk;
    const end = buf.lastIndexOf('</si>');
    if (end < 0) continue;
    flush(buf.slice(0, end + 5));
    buf = buf.slice(end + 5);
  }
  flush(buf);
  return out;
}

const colIndexCache = new Map<string, number>();
export function colIndex(letters: string): number {
  let v = colIndexCache.get(letters);
  if (v === undefined) {
    v = 0;
    for (let i = 0; i < letters.length; i++) v = v * 26 + (letters.charCodeAt(i) - 64);
    v -= 1;
    colIndexCache.set(letters, v);
  }
  return v;
}

/**
 * Chunked worksheet scanner. Feed text chunks with `push`, call `end()` at the end.
 * `onRow(cells)` receives an array of raw cell strings (null = empty) indexed by column; the array is reused.
 */
export class SheetScanner {
  private buf = '';
  private cells: (string | null)[] = [];
  rows = 0;
  private readonly rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
  private readonly cellRe =
    /<c\b(?:\s+r="([A-Z]+)\d+")?([^>]*?)(?:\/>|>(?:<f\b[^>]*?(?:\/>|>[\s\S]*?<\/f>))?(?:<v>([\s\S]*?)<\/v>)?(?:<is>([\s\S]*?)<\/is>)?[\s\S]*?<\/c>)/g;

  constructor(
    private sst: string[],
    private onRow: (cells: (string | null)[]) => void,
  ) {}

  push(chunk: string) {
    this.buf += chunk;
    const end = this.buf.lastIndexOf('</row>');
    if (end < 0) {
      if (this.buf.length > 64 * 1024 * 1024) throw new DataError('format', 'Worksheet XML contains an unexpectedly large row.');
      return;
    }
    const part = this.buf.slice(0, end + 6);
    this.buf = this.buf.slice(end + 6);
    this.scan(part);
  }

  end() {
    this.scan(this.buf);
    this.buf = '';
  }

  private scan(text: string) {
    const rowRe = this.rowRe;
    const cellRe = this.cellRe;
    const sst = this.sst;
    const cells = this.cells;
    rowRe.lastIndex = 0;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(text))) {
      cells.fill(null);
      const inner = rm[1];
      if (inner) {
        cellRe.lastIndex = 0;
        let cm: RegExpExecArray | null;
        let col = -1;
        while ((cm = cellRe.exec(inner))) {
          let letters = cm[1];
          const attrs = cm[2];
          if (!letters) {
            const rr = /\br="([A-Z]+)\d+"/.exec(attrs);
            letters = rr ? rr[1] : '';
          }
          col = letters ? colIndex(letters) : col + 1;
          let v: string | null = null;
          if (cm[3] !== undefined) {
            if (attrs.indexOf('t="s"') >= 0) v = sst[+cm[3]] ?? '';
            else v = decodeXml(cm[3]);
          } else if (cm[4] !== undefined) {
            v = textOfRuns(cm[4]);
          }
          cells[col] = v;
        }
      }
      this.rows++;
      this.onRow(cells);
    }
  }
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/** Find the path of the first worksheet (by workbook order, regardless of its name). */
export async function findFirstSheet(src: RandomAccessSource, entries: Map<string, ZipEntry>): Promise<string> {
  const wb = entries.get('xl/workbook.xml');
  const rels = entries.get('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const wbXml = await readZipText(src, wb);
    const sheet = /<sheet\b[^>]*?\br:id="([^"]+)"/.exec(wbXml) ?? /<sheet\b[^>]*?\bid="([^"]+)"/.exec(wbXml);
    if (sheet) {
      const relXml = await readZipText(src, rels);
      for (const m of relXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
        const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
        const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
        if (id === sheet[1] && target) {
          const p = resolvePath('xl/workbook.xml', target);
          if (entries.has(p)) return p;
        }
      }
    }
  }
  const sheets = [...entries.keys()].filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort();
  if (!sheets.length) throw new DataError('format', 'No worksheet found in the workbook.');
  return sheets[0];
}

export interface ParseOptions {
  onProgress?: (p: ParseProgress) => void;
  /** Skip validation (used by tools that want to inspect raw data). */
  skipValidation?: boolean;
}

/** Parse the first worksheet of an .xlsx into a columnar dataset. The first row is the header. */
export async function parseXlsx(src: RandomAccessSource, opts: ParseOptions = {}): Promise<Dataset> {
  const report = opts.onProgress ?? (() => {});
  report({ phase: 'directory', ratio: 0, rows: 0 });
  const entries = await readZipDirectory(src);
  const sheetPath = await findFirstSheet(src, entries);
  const sheetEntry = entries.get(sheetPath)!;
  const sstEntry = entries.get('xl/sharedStrings.xml');
  const totalBytes = sheetEntry.compressedSize + (sstEntry?.compressedSize ?? 0) || 1;

  let sst: string[] = [];
  if (sstEntry) {
    sst = await parseSharedStrings(
      streamZipText(src, sstEntry, (done) => report({ phase: 'strings', ratio: done / totalBytes, rows: 0 })),
    );
  }

  let builder: ColumnarBuilder | null = null;
  const scanner = new SheetScanner(sst, (cells) => {
    if (!builder) {
      const headers: string[] = [];
      for (let i = 0; i < cells.length; i++) headers.push(cells[i] ?? '');
      builder = new ColumnarBuilder(headers);
      return;
    }
    builder.addRow(cells);
  });
  const sstBytes = sstEntry?.compressedSize ?? 0;
  let lastReport = 0;
  for await (const chunk of streamZipText(src, sheetEntry, (done) => {
    const now = Date.now();
    if (now - lastReport > 150) {
      lastReport = now;
      report({ phase: 'sheet', ratio: (sstBytes + done) / totalBytes, rows: Math.max(0, scanner.rows - 1) });
    }
  })) {
    scanner.push(chunk);
  }
  scanner.end();
  report({ phase: 'finalizing', ratio: 1, rows: Math.max(0, scanner.rows - 1) });
  if (!builder) throw new DataError('empty', 'The first worksheet is empty.');
  const ds = (builder as ColumnarBuilder).finish();
  if (!opts.skipValidation) validateDataset(ds);
  return ds;
}
