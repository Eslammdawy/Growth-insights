/**
 * Web Worker that holds the active Dataset in memory, parses .xlsx / .json.gz files off the main thread,
 * and runs single-pass aggregations without blocking the UI.
 */
import { gunzipSync } from 'fflate';
import {
  AnalysisQuery,
  AnalysisResult,
  DatasetMeta,
  GroupRow,
  ItemTarget,
  analyze,
  analyzeItems,
  buildMeta,
  prepare,
} from '../lib/aggregate';
import { DataError, Dataset, decodeDataset, validateDataset } from '../lib/columnar';
import { ParseProgress, blobSource, parseXlsx } from '../lib/parse';

export type WorkerRequest =
  | { id: number; type: 'load-url'; url: string }
  | { id: number; type: 'load-file'; file: File }
  | { id: number; type: 'analyze'; query: AnalysisQuery }
  | { id: number; type: 'items'; query: AnalysisQuery; target: ItemTarget };

export type WorkerResponse =
  | { id: number; type: 'progress'; progress: ParseProgress }
  | { id: number; type: 'loaded'; meta: DatasetMeta; sourceName: string }
  | { id: number; type: 'analyzed'; result: AnalysisResult }
  | { id: number; type: 'items'; rows: GroupRow[] }
  | { id: number; type: 'error'; message: string; kind?: string; details?: string[] };

let currentDataset: Dataset | null = null;

async function decompressBytes(buf: ArrayBuffer, onProgress?: (p: ParseProgress) => void): Promise<string> {
  const bytes = new Uint8Array(buf);
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) {
    onProgress?.({ phase: 'finalizing', ratio: 0.9, rows: 0 });
    return new TextDecoder('utf-8').decode(bytes);
  }
  if (typeof DecompressionStream !== 'undefined') {
    onProgress?.({ phase: 'sheet', ratio: 0.5, rows: 0 });
    try {
      const ds = new DecompressionStream('gzip');
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      return await new Response(stream).text();
    } catch {
      // Fall back to gunzipSync if DecompressionStream fails
    }
  }
  onProgress?.({ phase: 'sheet', ratio: 0.5, rows: 0 });
  const unzipped = gunzipSync(bytes);
  return new TextDecoder('utf-8').decode(unzipped);
}

async function loadJsonGzFromBuffer(
  buf: ArrayBuffer,
  onProgress: (p: ParseProgress) => void,
): Promise<Dataset> {
  onProgress({ phase: 'directory', ratio: 0.15, rows: 0 });
  const text = await decompressBytes(buf, onProgress);
  onProgress({ phase: 'finalizing', ratio: 0.85, rows: 0 });
  if (text.trim().startsWith('<')) {
    throw new DataError(
      'format',
      'Received HTML document instead of JSON data. Check that the dataset URL is correct and exists on the server.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new DataError('format', `Invalid JSON in dataset file: ${(err as Error).message || 'parse error'}.`);
  }
  const ds = decodeDataset(parsed);
  validateDataset(ds);
  onProgress({ phase: 'finalizing', ratio: 1, rows: ds.rowCount });
  return ds;
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  const send = (res: WorkerResponse) => self.postMessage(res);
  try {
    if (msg.type === 'load-url') {
      send({ id: msg.id, type: 'progress', progress: { phase: 'directory', ratio: 0.05, rows: 0 } });
      let fetchUrl = msg.url;
      if (!/^https?:\/\//i.test(fetchUrl) && typeof self !== 'undefined' && self.location) {
        try {
          fetchUrl = new URL(fetchUrl, self.location.origin).href;
        } catch {
          // ignore URL parsing error and use fetchUrl as-is
        }
      }
      const resp = await fetch(fetchUrl);
      if (!resp.ok) {
        throw new DataError(
          'format',
          `Could not fetch sample data (${resp.status}). Run "npm run convert" first to generate public/data/sales.json.gz.`,
        );
      }
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new DataError(
          'format',
          `Could not load dataset from "${fetchUrl}": server returned an HTML page instead of dataset file.`,
        );
      }
      const buf = await resp.arrayBuffer();
      const ds = await loadJsonGzFromBuffer(buf, (progress) => send({ id: msg.id, type: 'progress', progress }));
      currentDataset = ds;
      prepare(ds);
      const meta = buildMeta(ds);
      send({ id: msg.id, type: 'loaded', meta, sourceName: 'Q3-2026 Sample Data (494k rows)' });
    } else if (msg.type === 'load-file') {
      const file = msg.file;
      const lower = file.name.toLowerCase();
      let ds: Dataset;
      if (lower.endsWith('.json.gz') || lower.endsWith('.json')) {
        const buf = await file.arrayBuffer();
        ds = await loadJsonGzFromBuffer(buf, (progress) => send({ id: msg.id, type: 'progress', progress }));
      } else if (lower.endsWith('.xlsx')) {
        ds = await parseXlsx(blobSource(file), {
          onProgress: (progress) => send({ id: msg.id, type: 'progress', progress }),
        });
      } else {
        throw new DataError('format', `Unsupported file type "${file.name}". Please upload an .xlsx or .json.gz file.`);
      }
      currentDataset = ds;
      prepare(ds);
      const meta = buildMeta(ds);
      send({ id: msg.id, type: 'loaded', meta, sourceName: file.name });
    } else if (msg.type === 'analyze') {
      if (!currentDataset) {
        throw new DataError('empty', 'No dataset loaded yet.');
      }
      const result = analyze(currentDataset, msg.query);
      send({ id: msg.id, type: 'analyzed', result });
    } else if (msg.type === 'items') {
      if (!currentDataset) {
        throw new DataError('empty', 'No dataset loaded yet.');
      }
      const rows = analyzeItems(currentDataset, msg.query, msg.target);
      send({ id: msg.id, type: 'items', rows });
    }
  } catch (err) {
    if (err instanceof DataError) {
      send({ id: msg.id, type: 'error', message: err.message, kind: err.kind, details: err.details });
    } else {
      send({
        id: msg.id,
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
