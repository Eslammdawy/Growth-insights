/**
 * Promise wrapper around `data.worker.ts` with progress callbacks.
 */
import { AnalysisQuery, AnalysisResult, DatasetMeta } from '../lib/aggregate';
import { DataError, DataErrorKind } from '../lib/columnar';
import { ParseProgress } from '../lib/parse';
import type { WorkerRequest, WorkerResponse } from './data.worker';

type Pending = {
  resolve: (val: any) => void;
  reject: (err: Error) => void;
  onProgress?: (p: ParseProgress) => void;
};

type WorkerPayload =
  | { type: 'load-url'; url: string }
  | { type: 'load-file'; file: File }
  | { type: 'analyze'; query: AnalysisQuery };

class DataWorkerClient {
  private worker: Worker | null = null;
  private seq = 1;
  private pending = new Map<number, Pending>();

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./data.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const msg = ev.data;
        const p = this.pending.get(msg.id);
        if (!p) return;
        if (msg.type === 'progress') {
          p.onProgress?.(msg.progress);
          return;
        }
        this.pending.delete(msg.id);
        if (msg.type === 'error') {
          p.reject(new DataError((msg.kind as DataErrorKind) ?? 'format', msg.message, msg.details ?? []));
        } else if (msg.type === 'loaded') {
          p.resolve({ meta: msg.meta, sourceName: msg.sourceName });
        } else if (msg.type === 'analyzed') {
          p.resolve(msg.result);
        }
      };
    }
    return this.worker;
  }

  private call<T>(req: WorkerPayload, onProgress?: (p: ParseProgress) => void): Promise<T> {
    const w = this.ensureWorker();
    const id = this.seq++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      w.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  loadUrl(url: string, onProgress?: (p: ParseProgress) => void): Promise<{ meta: DatasetMeta; sourceName: string }> {
    return this.call({ type: 'load-url', url }, onProgress);
  }

  loadFile(file: File, onProgress?: (p: ParseProgress) => void): Promise<{ meta: DatasetMeta; sourceName: string }> {
    return this.call({ type: 'load-file', file }, onProgress);
  }

  analyze(query: AnalysisQuery): Promise<AnalysisResult> {
    return this.call({ type: 'analyze', query });
  }
}

export const workerClient = new DataWorkerClient();
