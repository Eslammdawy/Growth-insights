import React, { useMemo, useState, useTransition } from 'react';
import { BarChart3, RotateCcw, Table2 } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useShallow } from 'zustand/react/shallow';
import { fmtCompact, fmtGrowth, fmtMetric, fmtPct, fmtSigned } from '../lib/format';
import { Growth, METRIC_LABEL, metricCells } from '../lib/metrics';
import { SHARED_PALETTE } from '../lib/palette';
import { useDashboardStore } from '../store/useDashboardStore';

interface MonthChartDatum {
  month: string;
  PY: number;
  CY: number;
  delta: number;
  growth: Growth;
  growthText: string;
  /** Ratio for secondary Y-axis line (e.g. 0.15 = +15.0%). */
  yoyPct: number | null;
}

export const MonthChart: React.FC = () => {
  const [, startTransition] = useTransition();
  const [showTable, setShowTable] = useState(false);

  const { result, metric, period, theme, drill, resetFilters } = useDashboardStore(
    useShallow((s) => ({
      result: s.result,
      metric: s.metric,
      period: s.period,
      theme: s.theme,
      drill: s.drill,
      resetFilters: s.resetFilters,
    }))
  );

  const data = useMemo<MonthChartDatum[]>(() => {
    if (!result) return [];
    return result.months.map((m) => {
      const cells = metricCells(m.sums, metric);
      const yoyPct =
        cells.growth.kind === 'pct'
          ? cells.growth.value
          : cells.growth.kind === 'lost'
            ? -1
            : cells.growth.kind === 'new'
              ? 1
              : null;
      return {
        month: m.label,
        PY: cells.py ?? 0,
        CY: cells.cy ?? 0,
        delta: cells.delta,
        growth: cells.growth,
        growthText: fmtGrowth(cells.growth),
        yoyPct,
      };
    });
  }, [result, metric]);

  const hasNonZero = useMemo(
    () => data.some((d) => Math.abs(d.PY) > 1e-9 || Math.abs(d.CY) > 1e-9),
    [data]
  );

  if (!result || data.length === 0 || !hasNonZero) {
    return (
      <div className="glass-panel flex h-[340px] flex-col items-center justify-center rounded-2xl border border-slate-200/70 p-6 text-center dark:border-slate-800/80">
        <BarChart3 className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        <h3 className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Monthly Trend ({METRIC_LABEL[metric]})
        </h3>
        <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
          No monthly PY or CY activity matches the current filter and period selection.
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
  const lineColor = isDark ? SHARED_PALETTE.upLight : SHARED_PALETTE.up;
  const totalCells = metricCells(result.totals, metric);

  const textSummary = data
    .map(
      (d) =>
        `${d.month}: PY ${fmtMetric(d.PY, metric)}, CY ${fmtMetric(d.CY, metric)} (${d.growthText})`
    )
    .join('; ');

  return (
    <div className="glass-panel relative flex flex-col overflow-hidden rounded-2xl border border-indigo-200/70 p-3.5 dark:border-slate-800/80">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500" />

      {/* Screen-reader text alternative */}
      <p className="sr-only">
        Monthly {METRIC_LABEL[metric]} trend comparing {period.pyYear} vs {period.cyYear}: {textSummary}.
      </p>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 dark:text-indigo-200">
            Monthly Trend ({METRIC_LABEL[metric]})
          </h2>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {period.pyYear} vs {period.cyYear} bars with YoY % line
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="hidden flex-wrap gap-1 text-[11px] tabular-nums sm:flex">
            {data.map((d) => (
              <span
                key={d.month}
                className="rounded-lg border border-indigo-200/70 bg-indigo-50/70 px-2 py-0.5 font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
              >
                {d.month}: <strong className="text-indigo-600 dark:text-cyan-400">{d.growthText}</strong>
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            aria-label={showTable ? 'Show monthly trend chart' : 'Show monthly trend data table'}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              showTable
                ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                : 'border-indigo-200/80 bg-white/80 text-slate-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
            }`}
          >
            {showTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
            <span>{showTable ? 'Chart' : 'Table'}</span>
          </button>
        </div>
      </div>

      {showTable ? (
        <div className="h-[280px] w-full overflow-auto rounded-xl border border-indigo-100/80 dark:border-slate-800">
          <table className="w-full border-collapse text-left text-xs tabular-nums">
            <thead className="sticky top-0 bg-indigo-50/95 text-[11px] font-extrabold uppercase tracking-wider text-indigo-950 dark:bg-slate-900/95 dark:text-indigo-200">
              <tr>
                <th className="border-b border-indigo-200/70 px-3 py-2 dark:border-slate-800">Month</th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  PY ({period.pyYear})
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  CY ({period.cyYear})
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  YoY Δ
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  YoY %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-100/60 dark:divide-slate-800/70">
              {data.map((d) => (
                <tr key={d.month} className="hover:bg-indigo-500/5 dark:hover:bg-indigo-500/10">
                  <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">{d.month}</td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                    {fmtMetric(d.PY, metric)}
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-900 dark:text-white">
                    {fmtMetric(d.CY, metric)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-bold ${
                      d.delta > 0
                        ? 'text-up dark:text-up-light'
                        : d.delta < 0
                          ? 'text-down dark:text-down-light'
                          : 'text-slate-500'
                    }`}
                  >
                    {fmtSigned(d.delta, metric)}
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-indigo-700 dark:text-cyan-300">
                    {d.growthText}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 border-t border-indigo-200 bg-indigo-950/95 font-bold text-white dark:border-slate-700">
              <tr>
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right text-violet-200">{fmtMetric(totalCells.py, metric)}</td>
                <td className="px-3 py-2 text-right text-cyan-300">{fmtMetric(totalCells.cy, metric)}</td>
                <td className="px-3 py-2 text-right">{fmtSigned(totalCells.delta, metric)}</td>
                <td className="px-3 py-2 text-right">{fmtGrowth(totalCells.growth)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 22, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="monthPyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.75} />
                </linearGradient>
                <linearGradient id="monthCyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.85} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: axisColor, fontSize: 11, fontWeight: 600 }}
                axisLine={{ stroke: gridColor }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={(v) => fmtCompact(v)}
                tick={{ fill: axisColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={54}
                domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.16)]}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(v) => fmtPct(v, true)}
                tick={{ fill: axisColor, fontSize: 10, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as MonthChartDatum | undefined;
                  if (!d) return null;
                  return (
                    <div className="rounded-xl border border-indigo-200/90 bg-white/95 p-2.5 text-xs shadow-lg backdrop-blur-md dark:border-indigo-500/40 dark:bg-slate-900/95">
                      <div className="mb-1.5 font-extrabold text-slate-900 dark:text-white">{d.month}</div>
                      <div className="space-y-1 tabular-nums">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-violet-600 dark:text-violet-300">PY ({period.pyYear}):</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">
                            {fmtMetric(d.PY, metric)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-cyan-600 dark:text-cyan-300">CY ({period.cyYear}):</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {fmtMetric(d.CY, metric)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-t border-slate-200/70 pt-1 dark:border-slate-800">
                          <span className="text-slate-500 dark:text-slate-400">YoY Δ:</span>
                          <span
                            className={`font-bold ${
                              d.delta >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                            }`}
                          >
                            {fmtSigned(d.delta, metric)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">YoY Growth %:</span>
                          <span
                            className={`font-extrabold ${
                              d.delta >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                            }`}
                          >
                            {d.growthText}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', fontWeight: 600 }}
                formatter={(v) =>
                  v === 'PY'
                    ? `PY (${period.pyYear})`
                    : v === 'CY'
                      ? `CY (${period.cyYear})`
                      : 'YoY Growth %'
                }
              />
              <Bar yAxisId="left" dataKey="PY" fill="url(#monthPyGrad)" radius={[6, 6, 0, 0]} maxBarSize={34}>
                <LabelList
                  dataKey="PY"
                  position="top"
                  offset={6}
                  formatter={(val: number) => (val > 0 ? fmtCompact(val) : '')}
                  fontSize={10}
                  fontWeight={700}
                  fill={isDark ? '#c4b5fd' : '#6d28d9'}
                />
              </Bar>
              <Bar yAxisId="left" dataKey="CY" fill="url(#monthCyGrad)" radius={[6, 6, 0, 0]} maxBarSize={34}>
                <LabelList
                  dataKey="CY"
                  position="top"
                  offset={6}
                  formatter={(val: number) => (val > 0 ? fmtCompact(val) : '')}
                  fontSize={10}
                  fontWeight={700}
                  fill={isDark ? '#67e8f9' : '#0284c7'}
                />
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="yoyPct"
                name="yoyPct"
                stroke={lineColor}
                strokeWidth={2.5}
                connectNulls
                dot={{
                  r: 4,
                  fill: isDark ? '#0f172a' : '#ffffff',
                  stroke: lineColor,
                  strokeWidth: 2.5,
                }}
                activeDot={{
                  r: 6,
                  fill: lineColor,
                  stroke: isDark ? '#0f172a' : '#ffffff',
                  strokeWidth: 2,
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
