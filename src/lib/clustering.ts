/**
 * Pure TypeScript average-linkage hierarchical clustering on cosine distance (1 - cosineSimilarity).
 * Used to reorder heatmap rows and columns so similar entities sit adjacent.
 *
 * Zero external dependencies (~80 LOC).
 */
import { cosineSimilarity } from './stats';

export interface DendrogramLeaf {
  index: number;
  label: string;
}

interface ClusterNode {
  items: number[];
  size: number;
}

/**
 * Performs agglomerative hierarchical clustering with average linkage (UPGMA)
 * on row vectors using cosine distance (1 - cosineSimilarity).
 *
 * @param M Row vectors
 * @param labels Row labels
 * @returns Array of row indices ordered so that similar rows are adjacent.
 */
export function hierarchicalCluster(M: number[][], _labels?: string[]): number[] {
  const n = M.length;
  if (n <= 1) return Array.from({ length: n }, (_, i) => i);

  // Initialize distance matrix between leaves
  const dist: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = 1 - cosineSimilarity(M[i], M[j]);
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }

  // Active clusters
  let clusters: (ClusterNode | null)[] = Array.from({ length: n }, (_, i) => ({
    items: [i],
    size: 1,
  }));
  let activeCount = n;

  // Working distance table between active cluster indices
  const currentDist = dist.map((row) => [...row]);

  while (activeCount > 1) {
    // Find closest pair of active clusters
    let minD = Infinity;
    let minI = -1;
    let minJ = -1;

    for (let i = 0; i < clusters.length; i++) {
      if (!clusters[i]) continue;
      for (let j = i + 1; j < clusters.length; j++) {
        if (!clusters[j]) continue;
        const d = currentDist[i][j];
        if (d < minD) {
          minD = d;
          minI = i;
          minJ = j;
        }
      }
    }

    if (minI === -1 || minJ === -1) break;

    const cI = clusters[minI]!;
    const cJ = clusters[minJ]!;

    // Create merged node
    const merged: ClusterNode = {
      items: [...cI.items, ...cJ.items],
      size: cI.size + cJ.size,
    };

    const newIdx = clusters.length;
    clusters.push(merged);

    // Compute average-linkage distance from new cluster to remaining active clusters
    const newRow = new Array<number>(newIdx + 1).fill(0);
    for (let k = 0; k < newIdx; k++) {
      if (!clusters[k] || k === minI || k === minJ) continue;
      const d = (cI.size * currentDist[minI][k] + cJ.size * currentDist[minJ][k]) / merged.size;
      newRow[k] = d;
      currentDist[k].push(d);
    }
    newRow[newIdx] = 0;
    currentDist.push(newRow);

    // Deactivate merged clusters
    clusters[minI] = null;
    clusters[minJ] = null;
    activeCount--;
  }

  // The last active cluster contains the ordered indices
  for (let i = clusters.length - 1; i >= 0; i--) {
    if (clusters[i]) {
      return clusters[i]!.items;
    }
  }

  return Array.from({ length: n }, (_, i) => i);
}
