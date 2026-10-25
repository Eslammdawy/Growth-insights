import React, { useMemo, useState, useTransition } from 'react';
import { CircleDot, Filter, RotateCcw, Table2 } from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { useShallow } from 'zustand/react/shallow';
import { DrillField, LEVELS, LEVEL_LABEL, Level } from '../lib/aggregate';
import { fmtCompact, fmtGrowth, fmtMetric, fmtPct, fmtSigned } from '../lib/format';
import { Growth, GrowthStatus, METRIC_LABEL, deriveRow } from '../lib/metrics';
import { STATUS_LABEL, statusColor } from '../lib/palette';
import { useDashboardStore } from '../store/useDashboardStore';

interface BubblePoint {
  id: string;
  field: DrillField;
  value: string;
  label: string;
  x: number; // PY
  y: number; // YoY ratio (clamped for plotting so extreme outliers don't flatten the chart)
  z: number; // CY (bubble size)
  py: number;
  cy: number;
  delta: number;
  growth: Growth;
  status: GrowthStatus;
}

const MAX_YOY_PLOT = 2.5; // +250% visual ceiling for plotted Y
const MIN_YOY_PLOT = -1.0; // -100% visual floor

export const BubbleScatterChart: React.FC = () => {
  const [, startTransition] = useTransition();
  const [level, setLevel] = useState<Level>('territory');
  const [showTable, setShowTable] = useState(false);

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

  const rows = result?.levels[level] ?? [];

  const points = useMemo<BubblePoint[]>(() => {
    if (!result || rows.length === 0) return [];
    const mapped: BubblePoint[] = [];
    for (const r of rows) {
      if (r.field === 'Item') continue;
      const d = deriveRow(r.sums, metric);
      if (d.growth.kind === 'none') continue;
      const rawRatio =
        d.growth.kind === 'pct'
          ? d.growth.value
          : d.growth.kind === 'lost'
            ? -1
            : 1.0; // 'new' plotted at +100% line with x = 0
      const clampedY = Math.max(MIN_YOY_PLOT, Math.min(MAX_YOY_PLOT, rawRatio));
      mapped.push({
        id: r.id,
        field: r.field,
        value: r.value,
        label: r.label,
        x: Math.max(0, d.py),
        y: clampedY,
        z: Math.max(0, d.cy),
        py: d.py,
        cy: d.cy,
        delta: d.delta,
        growth: d.growth,
        status: d.status,
      });
    }
    mapped.sort((a, b) => b.cy + b.py - (a.cy + a.py));
    return mapped.slice(0, 60);
  }, [result, rows, metric]);

  const handleBubbleClick = (pt: BubblePoint) => {
    startTransition(() => {
      addDrillRow([{ field: pt.field, value: pt.value, label: pt.label }]);
    });
  };

  if (!result || points.length === 0) {
    return (
      <div className="glass-panel flex h-[340px] flex-col items-center justify-center rounded-2xl border border-slate-200/70 p-6 text-center dark:border-slate-800/80">
        <CircleDot className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        <h3 className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          PY vs YoY % Bubble Scatter ({LEVEL_LABEL[level]})
        </h3>
        <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
          No active {LEVEL_LABEL[level].toLowerCase()} bubbles match the current filters.
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
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.25)';
  const axisColor = isDark ? '#94a3b8' : '#64748b';

  const statusCounts = points.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<GrowthStatus, number>
  );

  const textSummary = points
    .slice(0, 5)
    .map(
      (p) =>
        `${p.label}: PY ${fmtMetric(p.py, metric)}, CY ${fmtMetric(p.cy, metric)}, YoY ${fmtGrowth(p.growth)} (${STATUS_LABEL[p.status]})`
    )
    .join('; ');

  return (
    <div className="glass-panel relative flex flex-col overflow-hidden rounded-2xl border border-indigo-200/70 p-3.5 dark:border-slate-800/80">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-500" />

      <p className="sr-only">
        Bubble scatter of { points.length } {LEVEL_LABEL[level]}s plotting PY {METRIC_LABEL[metric]} on X, YoY Growth % on Y, and CY {METRIC_LABEL[metric]} as bubble size. Top items: {textSummary}.
      </p>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 dark:text-indigo-200">
              Bubble Scatter: PY vs YoY % ({METRIC_LABEL[metric]})
            </h2>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              X = PY · Y = YoY % · Size = CY · Click bubble to add drill chip
            </p>
          </div>

          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
            aria-label="Bubble scatter level selection"
            className="rounded-lg border border-indigo-200/80 bg-white/85 px-2.5 py-0.5 text-xs font-bold text-indigo-900 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-indigo-200"
          >
            {LEVELS.map((lvl) => (
              <option key={lvl} value={lvl} className="bg-white dark:bg-slate-900">
                {LEVEL_LABEL[lvl]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Legend */}
          <div className="hidden items-center gap-2 text-[10px] font-semibold sm:flex">
            {(['growing', 'declining', 'new', 'lost'] as GrowthStatus[]).map((st) =>
              statusCounts[st] ? (
                <span key={st} className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: statusColor(st, isDark) }}
                  />
                  {STATUS_LABEL[st]} ({statusCounts[st]})
                </span>
              ) : null
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            aria-label={showTable ? 'Show bubble scatter chart' : 'Show bubble scatter data table'}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              showTable
                ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                : 'border-indigo-200/80 bg-white/80 text-slate-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
            }`}
          >
            {showTable ? <CircleDot className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
            <span>{showTable ? 'Chart' : 'Table'}</span>
          </button>
        </div>
      </div>

      {showTable ? (
        <div className="h-[280px] w-full overflow-auto rounded-xl border border-indigo-100/80 dark:border-slate-800">
          <table className="w-full border-collapse text-left text-xs tabular-nums">
            <thead className="sticky top-0 bg-indigo-50/95 text-[11px] font-extrabold uppercase tracking-wider text-indigo-950 dark:bg-slate-900/95 dark:text-indigo-200">
              <tr>
                <th className="border-b border-indigo-200/70 px-3 py-2 dark:border-slate-800">
                  {LEVEL_LABEL[level]}
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 dark:border-slate-800">Status</th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  PY (X)
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  CY (Size)
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  YoY Δ
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  YoY % (Y)
                </th>
                <th className="border-b border-indigo-200/70 px-2 py-2 text-center dark:border-slate-800">
                  Drill
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-100/60 dark:divide-slate-800/70">
              {points.map((pt) => (
                <tr key={pt.id} className="hover:bg-indigo-500/5 dark:hover:bg-indigo-500/10">
                  <td className="px-3 py-1.5 font-semibold text-slate-900 dark:text-slate-100" dir="auto">
                    {pt.label}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: statusColor(pt.status, isDark) }}
                      />
                      {STATUS_LABEL[pt.status]}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-600 dark:text-slate-300">
                    {fmtMetric(pt.py, metric, false)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-slate-900 dark:text-white">
                    {fmtMetric(pt.cy, metric, false)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-bold ${
                      pt.delta >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                    }`}
                  >
                    {fmtSigned(pt.delta, metric, false)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-bold ${
                      pt.delta >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                    }`}
                  >
                    {fmtGrowth(pt.growth)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => handleBubbleClick(pt)}
                      title={`Add drill filter for ${pt.label}`}
                      aria-label={`Add drill filter for ${pt.label}`}
                      className="rounded-md p-1 text-indigo-600 hover:bg-indigo-500/15 dark:text-indigo-300"
                    >
                      <Filter className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 18, left: 4, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                type="number"
                dataKey="x"
                name="PY"
                tickFormatter={(v) => fmtCompact(v)}
                tick={{ fill: axisColor, fontSize: 10 }}
                axisLine={{ stroke: gridColor }}
                tickLine={false}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="YoY %"
                tickFormatter={(v) => fmtPct(v, true)}
                tick={{ fill: axisColor, fontSize: 10 }}
                axisLine={{ stroke: gridColor }}
                tickLine={false}
                width={56}
              />
              <ZAxis type="number" dataKey="z" range={[55, 620]} name="CY" />
              <ReferenceLine y={0} stroke={axisColor} strokeDasharray="4 3" strokeOpacity={0.55} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: axisColor }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const pt = payload[0]?.payload as BubblePoint | undefined;
                  if (!pt) return null;
                  return (
                    <div className="rounded-xl border border-indigo-200/90 bg-white/95 p-2.5 text-xs shadow-lg backdrop-blur-md dark:border-indigo-500/40 dark:bg-slate-900/95">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="font-extrabold text-slate-900 dark:text-white" dir="auto">
                          {pt.label}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                          style={{ backgroundColor: statusColor(pt.status, isDark) }}
                        >
                          {STATUS_LABEL[pt.status]}
                        </span>
                      </div>
                      <div className="space-y-1 tabular-nums">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">PY (X):</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {fmtMetric(pt.py, metric)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">CY (Size):</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {fmtMetric(pt.cy, metric)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">YoY Δ:</span>
                          <span
                            className={`font-bold ${
                              pt.delta >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                            }`}
                          >
                            {fmtSigned(pt.delta, metric)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">YoY Growth % (Y):</span>
                          <span
                            className={`font-extrabold ${
                              pt.delta >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                            }`}
                          >
                            {fmtGrowth(pt.growth)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1.5 border-t border-slate-200/70 pt-1 text-[10px] font-semibold text-indigo-600 dark:border-slate-800 dark:text-cyan-300">
                        Click bubble to add {LEVEL_LABEL[level]} drill chip
                      </div>
                    </div>
                  );
                }}
              />
              <Scatter
                data={points}
                onClick={(entry) => {
                  const pt = (entry?.payload ?? entry) as BubblePoint | undefined;
                  if (pt && pt.field && pt.value !== undefined) {
                    handleBubbleClick(pt);
                  }
                }}
                className="cursor-pointer"
              >
                {points.map((pt) => (
                  <Cell
                    key={pt.id}
                    fill={statusColor(pt.status, isDark)}
                    fillOpacity={0.78}
                    stroke={statusColor(pt.status, isDark)}
                    strokeWidth={1.5}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
