import { open } from 'node:fs/promises';
import type { RandomAccessSource } from '../src/lib/parse';

/** Random-access reader over a local file (no full read into memory). */
export async function fileSource(path: string): Promise<RandomAccessSource & { close(): Promise<void> }> {
  const fh = await open(path, 'r');
  const { size } = await fh.stat();
  return {
    size,
    async read(offset, length) {
      const buf = new Uint8Array(Math.max(0, Math.min(length, size - offset)));
      let got = 0;
      while (got < buf.length) {
        const { bytesRead } = await fh.read(buf, got, buf.length - got, offset + got);
        if (!bytesRead) break;
        got += bytesRead;
      }
      return got === buf.length ? buf : buf.subarray(0, got);
    },
    close: () => fh.close(),
  };
}
