import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GroupRow, LEVEL_LABEL } from '../lib/aggregate';
import { fmtCompact, fmtGrowth, fmtPct, fmtSigned } from '../lib/format';
import { METRIC_LABEL, deriveRow } from '../lib/metrics';
import { useDashboardStore } from '../store/useDashboardStore';

interface GrowthChartProps {
  rows: GroupRow[];
}

export const GrowthChart: React.FC<GrowthChartProps> = ({ rows }) => {
  const { result, metric, level, chartMode, setChartMode, theme } = useDashboardStore();

  const chartData = useMemo(() => {
    if (!result) return [];
    const enriched = rows
      .map((r) => {
        const d = deriveRow(r.sums, result.totals, metric);
        const val =
          chartMode === 'delta'
            ? d.delta ?? 0
            : d.growth.kind === 'pct'
              ? d.growth.value * 100
              : d.growth.kind === 'lost'
                ? -100
                : 0;
        return {
          name: r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label,
          fullName: r.label,
          val,
          delta: d.delta,
          growth: d.growth,
        };
      })
      .filter((x) => Number.isFinite(x.val) && x.val !== 0);

    return enriched.slice(0, 12);
  }, [rows, result, metric, chartMode]);

  if (!result || chartData.length === 0) return null;

  const isDark = theme === 'dark';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.25)';
  const axisColor = isDark ? '#cbd5e1' : '#334155';

  return (
    <div className="glass-panel flex flex-col rounded-2xl border border-slate-200/70 dark:border-slate-800/80 p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Top {chartData.length} {LEVEL_LABEL[level]}s by{' '}
            {chartMode === 'delta' ? `${METRIC_LABEL[metric]} Δ` : `${METRIC_LABEL[metric]} Growth %`}
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Ordered by current table sort
          </p>
        </div>

        <div
          role="group"
          aria-label="Chart mode"
          className="inline-flex rounded-xl bg-slate-200/80 dark:bg-slate-800/90 p-0.5 text-xs"
        >
          <button
            type="button"
            onClick={() => setChartMode('delta')}
            aria-pressed={chartMode === 'delta'}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
              chartMode === 'delta'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-sky-600 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Δ Absolute
          </button>
          <button
            type="button"
            onClick={() => setChartMode('growth')}
            aria-pressed={chartMode === 'growth'}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
              chartMode === 'growth'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-sky-600 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Growth %
          </button>
        </div>
      </div>

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 2, right: 20, left: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) => (chartMode === 'delta' ? fmtCompact(v) : `${v.toFixed(0)}%`)}
              tick={{ fill: axisColor, fontSize: 10 }}
              axisLine={{ stroke: gridColor }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={135}
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine x={0} stroke={axisColor} strokeOpacity={0.4} />
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                borderColor: isDark ? '#334155' : '#e2e8f0',
                borderRadius: '0.75rem',
                fontSize: '12px',
              }}
              formatter={(_: unknown, __: unknown, item: { payload?: (typeof chartData)[number] }) => {
                const p = item.payload;
                if (!p) return ['', ''];
                return [
                  `${fmtSigned(p.delta, metric)} (${fmtGrowth(p.growth)})`,
                  p.fullName,
                ];
              }}
            />
            <Bar dataKey="val" radius={[0, 5, 5, 0]} maxBarSize={18}>
              {chartData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.val >= 0 ? '#059669' : '#d97706'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export { fmtPct };
