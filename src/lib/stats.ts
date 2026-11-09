/**
 * Pure TypeScript implementations of:
 * - Cosine similarity (vectors & pairwise matrix)
 * - Chi-square test of independence for contingency tables
 * - Cramér's V effect size
 * - Regularized lower/upper incomplete gamma function for chi-square p-value (Numerical Recipes §6.2)
 *
 * Zero external dependencies.
 */

/**
 * Computes cosine similarity between two numeric vectors.
 * Returns 0 if either vector has zero Euclidean norm.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  if (normA <= 0 || normB <= 0) return 0;
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(-1, Math.min(1, sim));
}

/**
 * Computes the symmetric pairwise cosine similarity matrix of row vectors.
 * Diagonal entries are set to 1.
 */
export function cosineSimilarityMatrix(M: number[][]): number[][] {
  const n = M.length;
  const res: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    res[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(M[i], M[j]);
      res[i][j] = sim;
      res[j][i] = sim;
    }
  }

  return res;
}

/**
 * Lanczos approximation for ln(Gamma(z)) with g = 5, n = 6.
 * Accurate to ~10 decimal digits for z > 0.
 */
function lnGamma(z: number): number {
  const c = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.001208650973866179,
    -0.000005395239384953,
  ];
  let y = z;
  let tmp = z + 5.5;
  tmp -= (z + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += c[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / z);
}

/** Series expansion for P(a, x) when x < a + 1 (Numerical Recipes §6.2) */
function gammpSeries(a: number, x: number): number {
  let sum = 1 / a;
  let term = 1 / a;
  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

/** Continued fraction for Q(a, x) = 1 - P(a, x) when x >= a + 1 (Lentz's method) */
function gammqContFract(a: number, x: number): number {
  const TINY = 1e-30;
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

/** Chi-square survival function (p-value): P(X >= chi2) for dof */
export function chiSquarePValue(chi2: number, dof: number): number {
  if (chi2 <= 0 || dof <= 0) return 1;
  const a = dof / 2;
  const x = chi2 / 2;
  if (x < a + 1) {
    const p = 1 - gammpSeries(a, x);
    return Math.max(0, Math.min(1, p));
  }
  const q = gammqContFract(a, x);
  return Math.max(0, Math.min(1, q));
}

/**
 * Calculates Cramér's V effect size for an r x c contingency table.
 * V = sqrt(chi2 / (n * (min(r, c) - 1)))
 */
export function cramersV(chi2: number, n: number, r: number, c: number): number {
  const minDim = Math.min(r, c);
  if (minDim <= 1 || n <= 0 || chi2 <= 0) return 0;
  const v = Math.sqrt(chi2 / (n * (minDim - 1)));
  return Math.max(0, Math.min(1, isNaN(v) ? 0 : v));
}

/**
 * Performs a chi-square test of independence on a 2D contingency table.
 * Non-negative cell values are enforced (negative cells clamped to 0) to preserve
 * theoretical validity of expected cell counts.
 */
export function chiSquareIndependence(
  contingency: number[][]
): { chi2: number; dof: number; pValue: number; cramersV: number } {
  const r = contingency.length;
  if (r < 2) return { chi2: 0, dof: 0, pValue: 1, cramersV: 0 };
  const c = contingency[0]?.length ?? 0;
  if (c < 2) return { chi2: 0, dof: 0, pValue: 1, cramersV: 0 };

  const rowSums = new Float64Array(r);
  const colSums = new Float64Array(c);
  let totalN = 0;

  for (let i = 0; i < r; i++) {
    const row = contingency[i];
    for (let j = 0; j < c; j++) {
      const val = Math.max(0, row[j] || 0);
      rowSums[i] += val;
      colSums[j] += val;
      totalN += val;
    }
  }

  const dof = (r - 1) * (c - 1);
  if (totalN <= 0 || dof <= 0) {
    return { chi2: 0, dof, pValue: 1, cramersV: 0 };
  }

  let chi2 = 0;
  for (let i = 0; i < r; i++) {
    const rSum = rowSums[i];
    if (rSum <= 0) continue;
    for (let j = 0; j < c; j++) {
      const cSum = colSums[j];
      if (cSum <= 0) continue;
      const expected = (rSum * cSum) / totalN;
      if (expected > 0) {
        const observed = Math.max(0, contingency[i][j] || 0);
        const diff = observed - expected;
        chi2 += (diff * diff) / expected;
      }
    }
  }

  const pValue = chiSquarePValue(chi2, dof);
  const v = cramersV(chi2, totalN, r, c);

  return {
    chi2,
    dof,
    pValue,
    cramersV: v,
  };
}
