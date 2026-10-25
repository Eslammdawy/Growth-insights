import React, { useMemo, useState, useTransition } from 'react';
import { BarChart3, RotateCcw, Table2, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useShallow } from 'zustand/react/shallow';
import { LEVELS, LEVEL_LABEL, Level } from '../lib/aggregate';
import { fmtCompact, fmtGrowth, fmtMetric, fmtPct, fmtSigned } from '../lib/format';
import { METRIC_LABEL, deriveRow } from '../lib/metrics';
import { SHARED_PALETTE } from '../lib/palette';
import { useDashboardStore } from '../store/useDashboardStore';

export const GrowthChart: React.FC = () => {
  const [, startTransition] = useTransition();
  const [showTable, setShowTable] = useState(false);

  const {
    result,
    metric,
    chartLevel,
    setChartLevel,
    chartMode,
    setChartMode,
    theme,
    drill,
    resetFilters,
  } = useDashboardStore(
    useShallow((s) => ({
      result: s.result,
      metric: s.metric,
      chartLevel: s.chartLevel,
      setChartLevel: s.setChartLevel,
      chartMode: s.chartMode,
      setChartMode: s.setChartMode,
      theme: s.theme,
      drill: s.drill,
      resetFilters: s.resetFilters,
    }))
  );

  const rows = result?.levels[chartLevel] ?? [];

  const chartData = useMemo(() => {
    if (!result || rows.length === 0) return [];
    const enriched = rows
      .map((r) => {
        const d = deriveRow(r.sums, metric);
        const val =
          chartMode === 'delta'
            ? d.delta
            : d.growth.kind === 'pct'
              ? d.growth.value * 100
              : d.growth.kind === 'lost'
                ? -100
                : 0;
        return {
          name: r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label,
          fullName: r.label,
          py: d.py,
          cy: d.cy,
          val,
          delta: d.delta,
          growth: d.growth,
          growthText: fmtGrowth(d.growth),
        };
      })
      .filter((x) => Number.isFinite(x.val) && x.val !== 0);

    enriched.sort((a, b) => b.val - a.val);
    return enriched.slice(0, 10);
  }, [rows, result, metric, chartMode]);

  if (!result || chartData.length === 0) {
    return (
      <div className="glass-panel flex h-[340px] flex-col items-center justify-center rounded-2xl border border-slate-200/70 p-6 text-center dark:border-slate-800/80">
        <TrendingUp className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        <h3 className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          YoY Growth Chart ({LEVEL_LABEL[chartLevel]})
        </h3>
        <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
          No non-zero YoY growth entries available for the current level and filter selection.
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
  const axisColor = isDark ? '#cbd5e1' : '#334155';

  const textSummary = chartData
    .slice(0, 5)
    .map((d) => `${d.fullName}: ${fmtSigned(d.delta, metric)} (${fmtGrowth(d.growth)})`)
    .join('; ');

  return (
    <div className="glass-panel relative flex flex-col overflow-hidden rounded-2xl border border-indigo-200/70 p-3.5 dark:border-slate-800/80">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-rose-500" />

      <p className="sr-only">
        Top {chartData.length} {LEVEL_LABEL[chartLevel]}s by {METRIC_LABEL[metric]} YoY growth: {textSummary}.
      </p>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 dark:text-indigo-200">
              Top {chartData.length} by{' '}
              {chartMode === 'delta' ? `${METRIC_LABEL[metric]} YoY Δ` : `${METRIC_LABEL[metric]} YoY Growth %`}
            </h2>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {LEVEL_LABEL[chartLevel]} level ranked by {chartMode === 'delta' ? 'YoY Δ' : 'YoY Growth %'}
            </p>
          </div>

          <select
            value={chartLevel}
            onChange={(e) => setChartLevel(e.target.value as Level)}
            aria-label="Chart level selection"
            className="rounded-lg border border-indigo-200/80 bg-white/85 px-2.5 py-0.5 text-xs font-bold text-indigo-900 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-indigo-200"
          >
            {LEVELS.map((lvl) => (
              <option key={lvl} value={lvl} className="bg-white dark:bg-slate-900">
                {LEVEL_LABEL[lvl]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <div
            role="group"
            aria-label="Chart mode"
            className="inline-flex rounded-xl border border-indigo-200/70 bg-indigo-50/80 p-0.5 text-xs dark:border-slate-700/80 dark:bg-slate-800/90"
          >
            <button
              type="button"
              onClick={() => setChartMode('delta')}
              aria-pressed={chartMode === 'delta'}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                chartMode === 'delta'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              YoY Δ
            </button>
            <button
              type="button"
              onClick={() => setChartMode('growth')}
              aria-pressed={chartMode === 'growth'}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                chartMode === 'growth'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              YoY %
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            aria-label={showTable ? 'Show YoY growth bar chart' : 'Show YoY growth data table'}
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
                <th className="border-b border-indigo-200/70 px-3 py-2 dark:border-slate-800">
                  {LEVEL_LABEL[chartLevel]}
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">PY</th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">CY</th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">YoY Δ</th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">YoY %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-100/60 dark:divide-slate-800/70">
              {chartData.map((d) => (
                <tr key={d.fullName} className="hover:bg-indigo-500/5 dark:hover:bg-indigo-500/10">
                  <td className="px-3 py-1.5 font-semibold text-slate-900 dark:text-slate-100" dir="auto">
                    {d.fullName}
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-600 dark:text-slate-300">
                    {fmtMetric(d.py, metric, false)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-slate-900 dark:text-white">
                    {fmtMetric(d.cy, metric, false)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-bold ${
                      d.delta >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                    }`}
                  >
                    {fmtSigned(d.delta, metric, false)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-bold ${
                      d.delta >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                    }`}
                  >
                    {fmtGrowth(d.growth)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 2, right: 54, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => (chartMode === 'delta' ? fmtCompact(v) : fmtPct(v / 100, true))}
                tick={{ fill: axisColor, fontSize: 10 }}
                axisLine={{ stroke: gridColor }}
                tickLine={false}
                domain={[
                  (dataMin: number) => (dataMin < 0 ? dataMin * 1.15 : 0),
                  (dataMax: number) => (dataMax > 0 ? dataMax * 1.15 : 0),
                ]}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={135}
                tick={{ fill: axisColor, fontSize: 11, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine x={0} stroke={axisColor} strokeOpacity={0.4} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#0f172a' : '#ffffff',
                  borderColor: isDark ? '#4f46e5' : '#c7d2fe',
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                }}
                formatter={(_: unknown, __: unknown, item: { payload?: (typeof chartData)[number] }) => {
                  const p = item.payload;
                  if (!p) return ['', ''];
                  return [
                    `${fmtSigned(p.delta, metric)} (${fmtGrowth(p.growth)}) · CY: ${fmtMetric(p.cy, metric)}`,
                    p.fullName,
                  ];
                }}
              />
              <Bar dataKey="val" radius={[0, 6, 6, 0]} maxBarSize={16}>
                {chartData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={
                      entry.val >= 0
                        ? isDark
                          ? SHARED_PALETTE.upLight
                          : SHARED_PALETTE.up
                        : isDark
                          ? SHARED_PALETTE.downLight
                          : SHARED_PALETTE.down
                    }
                  />
                ))}
                <LabelList
                  content={(props: {
                    x?: number | string;
                    y?: number | string;
                    width?: number | string;
                    height?: number | string;
                    index?: number;
                  }) => {
                    const { x = 0, y = 0, width = 0, height = 0, index = 0 } = props;
                    const entry = chartData[index];
                    if (!entry || !entry.growthText) return null;
                    const numX = Number(x);
                    const numY = Number(y);
                    const numW = Number(width);
                    const numH = Number(height);
                    const isPos = numW >= 0;
                    const posX = isPos ? numX + numW + 6 : numX + numW - 6;
                    const anchor = isPos ? 'start' : 'end';
                    const isGrowthPositive =
                      entry.growth.kind === 'pct'
                        ? entry.growth.value >= 0
                        : entry.growth.kind === 'new';
                    const fill = isGrowthPositive
                      ? isDark
                        ? SHARED_PALETTE.upLight
                        : SHARED_PALETTE.up
                      : isDark
                        ? SHARED_PALETTE.downLight
                        : SHARED_PALETTE.down;

                    return (
                      <text
                        x={posX}
                        y={numY + numH / 2}
                        textAnchor={anchor}
                        dominantBaseline="central"
                        fill={fill}
                        fontSize={10}
                        fontWeight={700}
                        className="tabular-nums select-none"
                      >
                        {entry.growthText}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export { fmtPct };
