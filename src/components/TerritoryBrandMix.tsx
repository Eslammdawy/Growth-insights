import React, { useMemo, useState, useTransition } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Info,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { hierarchicalCluster } from '../lib/clustering';
import { fmtPct, fmtValue } from '../lib/format';
import { useDashboardStore } from '../store/useDashboardStore';

/**
 * Visual color interpolation for Okabe-Ito sequential & diverging ramps.
 */
function interpolateOkabeItoBlue(share: number, maxShare: number, isDark: boolean): { bg: string; text: string } {
  if (share <= 0) {
    return {
      bg: isDark ? 'rgba(30, 41, 59, 0.35)' : 'rgba(248, 250, 252, 0.85)',
      text: isDark ? '#64748b' : '#94a3b8',
    };
  }
  const ratio = Math.max(0, Math.min(1, maxShare > 0 ? share / maxShare : 0));
  // Okabe-Ito Blue is #0072B2 -> rgb(0, 114, 178)
  const alpha = isDark ? 0.15 + ratio * 0.75 : 0.08 + ratio * 0.82;
  const bg = `rgba(0, 114, 178, ${alpha.toFixed(3)})`;
  const text = ratio > 0.45 ? '#ffffff' : isDark ? '#38bdf8' : '#0369a1';
  return { bg, text };
}

function interpolateDivergingCosine(sim: number, isDark: boolean): { bg: string; text: string } {
  // Diverging: #D55E00 (vermillion, sim=0) -> #FFFFFF / slate (mid, sim=0.5) -> #0072B2 (blue, sim=1.0)
  const clamped = Math.max(0, Math.min(1, sim));
  if (clamped >= 0.5) {
    const t = (clamped - 0.5) / 0.5; // 0..1
    const alpha = isDark ? 0.15 + t * 0.75 : 0.08 + t * 0.82;
    const bg = `rgba(0, 114, 178, ${alpha.toFixed(3)})`;
    const text = t > 0.45 ? '#ffffff' : isDark ? '#38bdf8' : '#0369a1';
    return { bg, text };
  } else {
    const t = (0.5 - clamped) / 0.5; // 0..1 towards vermillion
    // Okabe-Ito vermillion is #D55E00 -> rgb(213, 94, 0)
    const alpha = isDark ? 0.15 + t * 0.75 : 0.08 + t * 0.82;
    const bg = `rgba(213, 94, 0, ${alpha.toFixed(3)})`;
    const text = t > 0.45 ? '#ffffff' : isDark ? '#fb923c' : '#c2410c';
    return { bg, text };
  }
}

export const TerritoryBrandMix: React.FC = () => {
  const [viewMode, setViewMode] = useState<'share' | 'raw'>('share');
  const [hoveredCell, setHoveredCell] = useState<{
    terr: string;
    brand: string;
    share: number;
    raw: number;
  } | null>(null);

  const [, startTransition] = useTransition();

  const { result, theme, addDrillRow } = useDashboardStore(
    useShallow((s) => ({
      result: s.result,
      theme: s.theme,
      addDrillRow: s.addDrillRow,
    }))
  );

  const isDark = theme === 'dark';
  const tbm = result?.territoryBrandMatrix;
  const sim = result?.territorySimilarity;
  const chi = result?.chiSquareTest;

  // 1. Hierarchical clustering row order (cosine distance)
  const rowOrder = useMemo(() => {
    if (!tbm || tbm.matrix.length <= 1) {
      return tbm?.matrix.map((_, i) => i) ?? [];
    }
    return hierarchicalCluster(tbm.matrix, tbm.territories);
  }, [tbm]);

  // Compute maximum brand share across all cells for color normalization
  const maxShare = useMemo(() => {
    if (!tbm || !tbm.territoryTotals.length) return 1;
    let m = 0;
    for (let i = 0; i < tbm.matrix.length; i++) {
      const tot = tbm.territoryTotals[i];
      if (tot <= 0) continue;
      for (let j = 0; j < tbm.matrix[i].length; j++) {
        const s = tbm.matrix[i][j] / tot;
        if (s > m) m = s;
      }
    }
    return m > 0 ? m : 1;
  }, [tbm]);

  const handleDrillTerritory = (territoryName: string) => {
    startTransition(() => {
      addDrillRow([{ field: 'Territory', value: territoryName, label: territoryName }]);
    });
  };

  const handleDrillPair = (terrA: string, terrB: string) => {
    startTransition(() => {
      addDrillRow([
        { field: 'Territory', value: terrA, label: terrA },
        { field: 'Territory', value: terrB, label: terrB },
      ]);
    });
  };

  if (!tbm || tbm.territories.length < 2 || tbm.brands.length < 2) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
        <Info className="mx-auto mb-1.5 h-4 w-4 text-slate-400" />
        Brand-mix analysis requires at least 2 territories and 2 brands matching active filters.
      </div>
    );
  }

  const { territories, brands, matrix, territoryTotals } = tbm;

  return (
    <div className="mt-6 space-y-5 border-t border-slate-200/80 pt-5 dark:border-slate-800/80">
      {/* 4.1 Statistical Verdict Banner */}
      {chi && (
        <div
          role="region"
          aria-label="Brand Mix Statistical Verdict"
          className={`flex flex-col gap-3 rounded-2xl border p-4 shadow-sm transition-all sm:flex-row sm:items-center sm:justify-between ${
            chi.isSignificant
              ? 'border-[#D55E00]/30 bg-gradient-to-r from-[#D55E00]/10 via-[#D55E00]/5 to-transparent text-slate-900 dark:text-slate-100'
              : 'border-slate-300/80 bg-slate-100/60 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-bold shadow-sm ${
                chi.isSignificant
                  ? 'bg-[#D55E00] text-white ring-2 ring-[#D55E00]/30'
                  : 'bg-slate-500 text-white'
              }`}
            >
              {chi.isSignificant ? <Sparkles className="h-4 w-4" /> : <Info className="h-4 w-4" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-extrabold tracking-wide uppercase ${
                    chi.isSignificant
                      ? 'bg-[#D55E00]/15 text-[#D55E00] ring-1 ring-[#D55E00]/40'
                      : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {chi.isSignificant ? 'Significant Association' : 'Homogeneous Distribution'}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  χ² Test of Independence
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {chi.interpretation}
              </p>
            </div>
          </div>

          {/* Statistical Metric Chips */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium sm:justify-end">
            <span
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white/90 px-2.5 py-1 text-slate-800 shadow-xs dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
              title="p-value of chi-square test of independence"
            >
              <span className="font-semibold text-slate-500">p:</span>
              <span className="font-mono font-bold">
                {chi.pValue < 0.0001 ? chi.pValue.toExponential(2) : chi.pValue.toFixed(4)}
              </span>
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white/90 px-2.5 py-1 text-slate-800 shadow-xs dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
              title="Cramér's V effect size (0 = no association, 1 = complete association)"
            >
              <span className="font-semibold text-slate-500">Cramér's V:</span>
              <span className="font-mono font-bold">{chi.cramersV.toFixed(2)}</span>
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white/90 px-2.5 py-1 text-slate-800 shadow-xs dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
              title="Chi-square statistic and degrees of freedom"
            >
              <span className="font-semibold text-slate-500">χ²:</span>
              <span className="font-mono font-bold">
                {chi.chi2.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
              <span className="text-slate-400">(df={chi.dof})</span>
            </span>
          </div>
        </div>
      )}

      {/* 4.2 Clustered Heatmap: Territory × Brand */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/60">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Layers className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Territory × Brand Mix Heatmap
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Rows clustered by brand-mix cosine similarity (similar territories adjacent) · Brands ordered by CY volume desc
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {/* View Mode Toggle */}
            <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold dark:border-slate-800 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setViewMode('share')}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  viewMode === 'share'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Share %
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  viewMode === 'raw'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Raw EGP
              </button>
            </div>
          </div>
        </div>

        {/* Hover inspector badge */}
        {hoveredCell && (
          <div className="mb-2 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200/60 bg-indigo-50/60 px-3 py-1.5 text-xs font-medium text-slate-800 dark:border-indigo-950/60 dark:bg-indigo-950/30 dark:text-slate-200">
            <span>
              Territory: <strong className="text-indigo-600 dark:text-indigo-400">{hoveredCell.terr}</strong>
            </span>
            <span>·</span>
            <span>
              Brand: <strong className="text-slate-900 dark:text-white">{hoveredCell.brand}</strong>
            </span>
            <span>·</span>
            <span>
              Share: <strong className="text-indigo-600 dark:text-indigo-400">{fmtPct(hoveredCell.share)}</strong>
            </span>
            <span>·</span>
            <span>
              Net Value: <strong className="font-mono">{fmtValue(hoveredCell.raw, false)}</strong>
            </span>
          </div>
        )}

        {/* Scrollable Heatmap Grid */}
        <div className="max-h-[500px] overflow-auto rounded-xl border border-slate-200/90 shadow-inner dark:border-slate-800">
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-20 bg-slate-100/95 font-semibold text-slate-700 shadow-xs backdrop-blur-md dark:bg-slate-900/95 dark:text-slate-300">
              <tr>
                <th className="sticky left-0 z-30 min-w-[140px] max-w-[180px] border-b border-r border-slate-200 bg-slate-100/95 px-2.5 py-2 text-left font-bold dark:border-slate-800 dark:bg-slate-900/95">
                  Territory ({territories.length})
                </th>
                {brands.map((b) => (
                  <th
                    key={b}
                    title={b}
                    className="min-w-[90px] max-w-[130px] truncate border-b border-r border-slate-200 px-2 py-2 text-right font-medium dark:border-slate-800"
                  >
                    {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowOrder.map((origIdx) => {
                const terrName = territories[origIdx];
                const rowTot = territoryTotals[origIdx];
                const row = matrix[origIdx];

                return (
                  <tr key={terrName} className="group hover:bg-slate-50/40 dark:hover:bg-slate-800/30">
                    <td className="sticky left-0 z-10 truncate border-b border-r border-slate-200 bg-white/95 px-2.5 py-1.5 font-medium text-slate-800 shadow-xs backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-200">
                      <button
                        type="button"
                        onClick={() => handleDrillTerritory(terrName)}
                        title={`Filter dashboard to ${terrName}`}
                        className="truncate text-left transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        {terrName}
                      </button>
                    </td>
                    {brands.map((b, bIdx) => {
                      const rawVal = row[bIdx] ?? 0;
                      const share = rowTot > 0 ? rawVal / rowTot : 0;
                      const { bg, text } = interpolateOkabeItoBlue(share, maxShare, isDark);

                      return (
                        <td
                          key={b}
                          style={{ backgroundColor: bg, color: text }}
                          onMouseEnter={() =>
                            setHoveredCell({ terr: terrName, brand: b, share, raw: rawVal })
                          }
                          onMouseLeave={() => setHoveredCell(null)}
                          className="border-b border-r border-slate-200/40 px-2 py-1.5 text-right font-mono text-[10px] tabular-nums transition-colors hover:ring-2 hover:ring-indigo-500 dark:border-slate-800/40"
                        >
                          {viewMode === 'share'
                            ? share > 0.0005
                              ? fmtPct(share)
                              : '–'
                            : rawVal !== 0
                              ? fmtValue(rawVal, false)
                              : '–'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4.3 Territory Similarity Matrix & Top/Bottom Pairs */}
      {sim && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Main: Lower-Triangular Similarity Matrix */}
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm lg:col-span-2 dark:border-slate-800/80 dark:bg-slate-900/60">
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <BarChart2 className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Territory Pairwise Brand-Mix Similarity
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Lower-triangular cosine similarity matrix · Diverging ramp: #D55E00 (low) → Neutral (mid) → #0072B2 (high)
              </p>
            </div>

            <div className="max-h-[460px] overflow-auto rounded-xl border border-slate-200/90 shadow-inner dark:border-slate-800">
              <table className="w-full border-collapse text-[10px]">
                <thead className="sticky top-0 z-20 bg-slate-100/95 font-semibold text-slate-700 shadow-xs backdrop-blur-md dark:bg-slate-900/95 dark:text-slate-300">
                  <tr>
                    <th className="sticky left-0 z-30 min-w-[130px] border-b border-r border-slate-200 bg-slate-100/95 px-2 py-1.5 text-left font-bold dark:border-slate-800 dark:bg-slate-900/95">
                      Territory
                    </th>
                    {rowOrder.map((rIdx) => (
                      <th
                        key={territories[rIdx]}
                        title={territories[rIdx]}
                        className="min-w-[44px] max-w-[60px] truncate border-b border-r border-slate-200 px-1 py-1.5 text-center dark:border-slate-800"
                      >
                        {territories[rIdx].slice(0, 4)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowOrder.map((iIdx, rowPos) => {
                    const rowTerr = territories[iIdx];
                    return (
                      <tr key={rowTerr}>
                        <td className="sticky left-0 z-10 truncate border-b border-r border-slate-200 bg-white/95 px-2 py-1 font-medium text-slate-800 shadow-xs dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-200">
                          <button
                            type="button"
                            onClick={() => handleDrillTerritory(rowTerr)}
                            title={`Filter dashboard to ${rowTerr}`}
                            className="truncate text-left hover:text-sky-600 dark:hover:text-sky-400"
                          >
                            {rowTerr}
                          </button>
                        </td>
                        {rowOrder.map((jIdx, colPos) => {
                          if (colPos > rowPos) {
                            return (
                              <td
                                key={territories[jIdx]}
                                className="border-b border-r border-slate-100 bg-slate-50/20 dark:border-slate-800/20 dark:bg-slate-950/20"
                              />
                            );
                          }

                          const colTerr = territories[jIdx];
                          const score = sim.cosine[iIdx][jIdx] ?? 0;
                          const isDiagonal = colPos === rowPos;
                          const { bg, text } = isDiagonal
                            ? {
                                bg: isDark ? 'rgba(0, 114, 178, 0.45)' : 'rgba(0, 114, 178, 0.35)',
                                text: isDark ? '#ffffff' : '#0369a1',
                              }
                            : interpolateDivergingCosine(score, isDark);

                          return (
                            <td
                              key={colTerr}
                              style={{ backgroundColor: bg, color: text }}
                              onClick={() => {
                                if (!isDiagonal) handleDrillPair(rowTerr, colTerr);
                                else handleDrillTerritory(rowTerr);
                              }}
                              title={
                                isDiagonal
                                  ? `${rowTerr} (self: 100%)`
                                  : `${rowTerr} ↔ ${colTerr}: ${(score * 100).toFixed(1)}% similarity. Click to filter.`
                              }
                              className="cursor-pointer border-b border-r border-slate-200/40 px-1 py-1 text-center font-mono text-[9px] tabular-nums transition-transform hover:scale-105 hover:ring-1 hover:ring-indigo-400 dark:border-slate-800/40"
                            >
                              {(score * 100).toFixed(0)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar: Top and Bottom Territory Pairs */}
          <div className="flex flex-col gap-4">
            {/* Top 5 Most-Similar Pairs */}
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/60">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-4 w-4" />
                <span>Top Most-Similar Pairs</span>
              </div>
              <ul className="space-y-1.5">
                {sim.topPairs.slice(0, 5).map((p, idx) => (
                  <li key={`${p.a}-${p.b}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => handleDrillPair(p.a, p.b)}
                      title={`Filter to ${p.a} and ${p.b}`}
                      className="group flex w-full items-center justify-between rounded-xl border border-slate-200/70 bg-slate-50/70 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30"
                    >
                      <div className="min-w-0 flex-1 truncate pr-2">
                        <span className="font-semibold text-slate-800 group-hover:text-emerald-700 dark:text-slate-200 dark:group-hover:text-emerald-300">
                          {p.a}
                        </span>
                        <span className="text-slate-400"> ↔ </span>
                        <span className="font-semibold text-slate-800 group-hover:text-emerald-700 dark:text-slate-200 dark:group-hover:text-emerald-300">
                          {p.b}
                        </span>
                      </div>
                      <span className="rounded-lg bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                        {(p.sim * 100).toFixed(1)}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Top 5 Least-Similar Pairs */}
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/60">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#D55E00] dark:text-[#ff781f]">
                <ArrowDownRight className="h-4 w-4" />
                <span>Top Least-Similar Pairs</span>
              </div>
              <ul className="space-y-1.5">
                {sim.bottomPairs.slice(0, 5).map((p, idx) => (
                  <li key={`${p.a}-${p.b}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => handleDrillPair(p.a, p.b)}
                      title={`Filter to ${p.a} and ${p.b}`}
                      className="group flex w-full items-center justify-between rounded-xl border border-slate-200/70 bg-slate-50/70 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-[#D55E00]/40 hover:bg-[#D55E00]/5 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-[#D55E00]/60 dark:hover:bg-[#D55E00]/10"
                    >
                      <div className="min-w-0 flex-1 truncate pr-2">
                        <span className="font-semibold text-slate-800 group-hover:text-[#D55E00] dark:text-slate-200">
                          {p.a}
                        </span>
                        <span className="text-slate-400"> ↔ </span>
                        <span className="font-semibold text-slate-800 group-hover:text-[#D55E00] dark:text-slate-200">
                          {p.b}
                        </span>
                      </div>
                      <span className="rounded-lg bg-[#D55E00]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#D55E00] dark:bg-[#D55E00]/20 dark:text-[#ff781f]">
                        {(p.sim * 100).toFixed(1)}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
