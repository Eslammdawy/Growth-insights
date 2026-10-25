import React, { useMemo, useState, useTransition } from 'react';
import { Grid3X3, RotateCcw, Search, Table2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { fmtGrowth, fmtMetric, fmtSigned } from '../lib/format';
import { METRIC_LABEL, MetricCells, metricCells } from '../lib/metrics';
import { growthScaleStyle } from '../lib/palette';
import { useDashboardStore } from '../store/useDashboardStore';

interface HeatmapRow {
  territory: string;
  label: string;
  total: MetricCells;
  months: { month: number; label: string; cells: MetricCells }[];
}

interface HoveredCell {
  territoryLabel: string;
  periodLabel: string;
  cells: MetricCells;
}

export const TerritoryHeatmap: React.FC = () => {
  const [, startTransition] = useTransition();
  const [showTable, setShowTable] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState<number>(25);
  const [hovered, setHovered] = useState<HoveredCell | null>(null);

  const { result, metric, theme, addDrillRow, drill, resetFilters } = useDashboardStore(
    useShallow((s) => ({
      result: s.result,
      metric: s.metric,
      theme: s.theme,
      addDrillRow: s.addDrillRow,
      drill: s.drill,
      resetFilters: s.resetFilters,
    }))
  );

  const rows = useMemo<HeatmapRow[]>(() => {
    if (!result || !result.territoryMonths) return [];
    const q = search.trim().toLowerCase();
    const mapped = result.territoryMonths
      .filter((tm) => !q || tm.label.toLowerCase().includes(q))
      .map((tm) => ({
        territory: tm.territory,
        label: tm.label,
        total: metricCells(tm.sums, metric),
        months: tm.months.map((m) => ({
          month: m.month,
          label: m.label,
          cells: metricCells(m.sums, metric),
        })),
      }))
      .filter((r) => r.total.growth.kind !== 'none' || r.months.some((m) => m.cells.growth.kind !== 'none'));

    mapped.sort((a, b) => b.total.cy + b.total.py - (a.total.cy + a.total.py));
    return limit > 0 ? mapped.slice(0, limit) : mapped;
  }, [result, metric, search, limit]);

  if (!result || result.territoryMonths.length === 0 || result.months.length === 0) {
    return (
      <div className="glass-panel flex h-[340px] flex-col items-center justify-center rounded-2xl border border-slate-200/70 p-6 text-center dark:border-slate-800/80">
        <Grid3X3 className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        <h3 className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Territory × Month YoY % Heatmap
        </h3>
        <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
          No territory monthly data available for the current filter selection.
        </p>
        {drill.length > 0 && (
          <button
            type="button"
            onClick={() => startTransition(() => resetFilters())}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset filters
          </button>
        )}
      </div>
    );
  }

  const isDark = theme === 'dark';
  const monthCols = result.months;
  const gridColsTemplate = `minmax(140px, 1.6fr) repeat(${monthCols.length}, minmax(76px, 1fr)) minmax(86px, 1fr)`;

  const handleDrillTerritory = (territory: string, label: string) => {
    startTransition(() => {
      addDrillRow([{ field: 'Territory', value: territory, label }]);
    });
  };

  const textSummary = rows
    .slice(0, 5)
    .map(
      (r) =>
        `${r.label}: Total ${fmtGrowth(r.total.growth)} (${r.months
          .map((m) => `${m.label} ${fmtGrowth(m.cells.growth)}`)
          .join(', ')})`
    )
    .join('; ');

  return (
    <div className="glass-panel relative flex flex-col overflow-hidden rounded-2xl border border-indigo-200/70 p-3.5 dark:border-slate-800/80">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-indigo-500 to-rose-500" />

      <p className="sr-only">
        Territory by month {METRIC_LABEL[metric]} YoY % heatmap across {monthCols.map((m) => m.label).join(', ')}: {textSummary}.
      </p>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 dark:text-indigo-200">
            Territory × Month YoY % Heatmap ({METRIC_LABEL[metric]})
          </h2>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            CSS grid colored from shared palette · Click territory to add drill chip
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Shared Palette Scale Legend */}
          <div className="hidden items-center gap-1 rounded-lg border border-indigo-200/60 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 xl:flex">
            <span>−60%</span>
            <span
              className="h-2.5 w-3 rounded-sm"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-down) 65%, transparent)' }}
            />
            <span
              className="h-2.5 w-3 rounded-sm"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-down) 30%, transparent)' }}
            />
            <span className="h-2.5 w-3 rounded-sm bg-slate-300 dark:bg-slate-700" />
            <span
              className="h-2.5 w-3 rounded-sm"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-up) 30%, transparent)' }}
            />
            <span
              className="h-2.5 w-3 rounded-sm"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-up) 65%, transparent)' }}
            />
            <span>+60%</span>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-indigo-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter territory…"
              aria-label="Filter heatmap territories"
              className="w-36 rounded-lg border border-indigo-200/80 bg-white/85 py-0.5 pl-6 pr-5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-100"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear territory search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <select
            value={String(limit)}
            onChange={(e) => setLimit(Number(e.target.value))}
            aria-label="Heatmap territory limit"
            className="rounded-lg border border-indigo-200/80 bg-white/85 px-2 py-0.5 text-xs font-bold text-indigo-900 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-indigo-200"
          >
            <option value="15" className="bg-white dark:bg-slate-900">Top 15</option>
            <option value="25" className="bg-white dark:bg-slate-900">Top 25</option>
            <option value="50" className="bg-white dark:bg-slate-900">Top 50</option>
            <option value="0" className="bg-white dark:bg-slate-900">All ({result.territoryMonths.length})</option>
          </select>

          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            aria-label={showTable ? 'Show territory YoY heatmap' : 'Show territory YoY data table'}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              showTable
                ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                : 'border-indigo-200/80 bg-white/80 text-slate-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
            }`}
          >
            {showTable ? <Grid3X3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
            <span>{showTable ? 'Heatmap' : 'Table'}</span>
          </button>
        </div>
      </div>

      {/* Live formatted tooltip banner on cell hover/focus */}
      <div className="mb-2 flex min-h-[26px] items-center justify-between rounded-xl border border-indigo-200/60 bg-indigo-50/60 px-2.5 py-1 text-[11px] tabular-nums dark:border-slate-800 dark:bg-slate-900/60">
        {hovered ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-extrabold text-indigo-950 dark:text-indigo-200" dir="auto">
              {hovered.territoryLabel} · {hovered.periodLabel}
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              PY: <strong>{fmtMetric(hovered.cells.py, metric)}</strong>
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              CY: <strong>{fmtMetric(hovered.cells.cy, metric)}</strong>
            </span>
            <span
              className={`font-bold ${
                hovered.cells.delta >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
              }`}
            >
              Δ: {fmtSigned(hovered.cells.delta, metric)} ({fmtGrowth(hovered.cells.growth)})
            </span>
          </div>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">
            Hover or focus any cell to inspect formatted PY, CY, YoY Δ, and YoY Growth %.
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          No territories match "{search}".
        </div>
      ) : showTable ? (
        <div className="h-[248px] w-full overflow-auto rounded-xl border border-indigo-100/80 dark:border-slate-800">
          <table className="w-full border-collapse text-left text-xs tabular-nums">
            <thead className="sticky top-0 z-10 bg-indigo-50/95 text-[11px] font-extrabold uppercase tracking-wider text-indigo-950 dark:bg-slate-900/95 dark:text-indigo-200">
              <tr>
                <th className="border-b border-indigo-200/70 px-3 py-2 dark:border-slate-800">Territory</th>
                {monthCols.map((m) => (
                  <th
                    key={m.month}
                    className="border-b border-indigo-200/70 px-2.5 py-2 text-right dark:border-slate-800"
                  >
                    {m.label} (CY / YoY %)
                  </th>
                ))}
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  Total CY / YoY %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-100/60 dark:divide-slate-800/70">
              {rows.map((r) => (
                <tr key={r.territory} className="hover:bg-indigo-500/5 dark:hover:bg-indigo-500/10">
                  <td className="px-3 py-1.5 font-semibold text-slate-900 dark:text-slate-100" dir="auto">
                    <button
                      type="button"
                      onClick={() => handleDrillTerritory(r.territory, r.label)}
                      className="text-left hover:text-indigo-600 hover:underline dark:hover:text-cyan-400"
                    >
                      {r.label}
                    </button>
                  </td>
                  {r.months.map((m) => (
                    <td key={m.month} className="px-2.5 py-1.5 text-right">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {fmtMetric(m.cells.cy, metric, false)}
                      </div>
                      <div
                        className={`text-[11px] font-bold ${
                          m.cells.delta >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                        }`}
                      >
                        {fmtGrowth(m.cells.growth)}
                      </div>
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {fmtMetric(r.total.cy, metric, false)}
                    </div>
                    <div
                      className={`text-[11px] font-extrabold ${
                        r.total.delta >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                      }`}
                    >
                      {fmtGrowth(r.total.growth)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          role="grid"
          aria-label="Territory by Month YoY Growth % Heatmap"
          className="h-[248px] w-full overflow-auto rounded-xl border border-indigo-100/80 p-1.5 dark:border-slate-800"
        >
          {/* CSS Grid Header Row */}
          <div
            role="row"
            style={{ gridTemplateColumns: gridColsTemplate }}
            className="sticky top-0 z-10 grid gap-1 rounded-lg bg-indigo-50/95 px-2 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-indigo-950 backdrop-blur-md dark:bg-slate-900/95 dark:text-indigo-200"
          >
            <div role="columnheader" className="truncate">
              Territory
            </div>
            {monthCols.map((m) => (
              <div key={m.month} role="columnheader" className="text-center">
                {m.label}
              </div>
            ))}
            <div role="columnheader" className="text-center">
              Total
            </div>
          </div>

          {/* CSS Grid Data Rows */}
          <div className="mt-1 space-y-1">
            {rows.map((r) => {
              const totalStyle = growthScaleStyle(r.total.growth, isDark);
              const totalTooltip = `${r.label} (Total) — PY: ${fmtMetric(r.total.py, metric)}, CY: ${fmtMetric(r.total.cy, metric)}, Δ: ${fmtSigned(r.total.delta, metric)} (${fmtGrowth(r.total.growth)})`;
              return (
                <div
                  key={r.territory}
                  role="row"
                  style={{ gridTemplateColumns: gridColsTemplate }}
                  className="grid items-center gap-1 text-xs tabular-nums"
                >
                  <button
                    type="button"
                    role="rowheader"
                    onClick={() => handleDrillTerritory(r.territory, r.label)}
                    title={`Filter dashboard by Territory: ${r.label}`}
                    dir="auto"
                    className="truncate rounded-lg border border-transparent px-2 py-1.5 text-left font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-500/10 hover:text-indigo-700 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:text-cyan-300"
                  >
                    {r.label}
                  </button>

                  {r.months.map((m) => {
                    const style = growthScaleStyle(m.cells.growth, isDark);
                    const cellTitle = `${r.label} (${m.label}) — PY: ${fmtMetric(m.cells.py, metric)}, CY: ${fmtMetric(m.cells.cy, metric)}, Δ: ${fmtSigned(m.cells.delta, metric)} (${fmtGrowth(m.cells.growth)})`;
                    return (
                      <div
                        key={m.month}
                        role="gridcell"
                        tabIndex={0}
                        title={cellTitle}
                        onMouseEnter={() =>
                          setHovered({
                            territoryLabel: r.label,
                            periodLabel: m.label,
                            cells: m.cells,
                          })
                        }
                        onFocus={() =>
                          setHovered({
                            territoryLabel: r.label,
                            periodLabel: m.label,
                            cells: m.cells,
                          })
                        }
                        style={style}
                        className="flex h-7 items-center justify-center rounded-lg border px-1.5 text-[11px] font-bold transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {fmtGrowth(m.cells.growth)}
                      </div>
                    );
                  })}

                  <div
                    role="gridcell"
                    tabIndex={0}
                    title={totalTooltip}
                    onMouseEnter={() =>
                      setHovered({
                        territoryLabel: r.label,
                        periodLabel: 'Total',
                        cells: r.total,
                      })
                    }
                    onFocus={() =>
                      setHovered({
                        territoryLabel: r.label,
                        periodLabel: 'Total',
                        cells: r.total,
                      })
                    }
                    style={totalStyle}
                    className="flex h-7 items-center justify-center rounded-lg border px-1.5 text-[11px] font-extrabold ring-1 ring-inset ring-black/5 transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:ring-white/10"
                  >
                    {fmtGrowth(r.total.growth)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
