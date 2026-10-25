import React, { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtCompact, fmtGrowth, fmtMetric } from '../lib/format';
import { METRIC_LABEL, metricCells } from '../lib/metrics';
import { useShallow } from 'zustand/react/shallow';
import { useDashboardStore } from '../store/useDashboardStore';

export const MonthChart: React.FC = () => {
  const { result, metric, period, theme } = useDashboardStore(
    useShallow((s) => ({
      result: s.result,
      metric: s.metric,
      period: s.period,
      theme: s.theme,
    }))
  );

  const data = useMemo(() => {
    if (!result) return [];
    return result.months.map((m) => {
      const cells = metricCells(m.sums, metric);
      return {
        month: m.label,
        PY: cells.py ?? 0,
        CY: cells.cy ?? 0,
        growthText: fmtGrowth(cells.growth),
      };
    });
  }, [result, metric]);

  if (!result || data.length === 0) {
    return (
      <div className="glass-panel flex h-[340px] flex-col items-center justify-center rounded-2xl border border-slate-200/70 p-6 text-center dark:border-slate-800/80">
        <BarChart3 className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        <h3 className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Monthly Trend ({METRIC_LABEL[metric]})
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          No monthly data available for the current selection.
        </p>
      </div>
    );
  }

  const isDark = theme === 'dark';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.25)';
  const axisColor = isDark ? '#94a3b8' : '#64748b';

  return (
    <div className="glass-panel flex flex-col rounded-2xl border border-slate-200/70 dark:border-slate-800/80 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Monthly Trend ({METRIC_LABEL[metric]})
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {period.pyYear} vs {period.cyYear} by month
          </p>
        </div>
        <div className="flex gap-2 text-[11px] tabular-nums">
          {data.map((d) => (
            <span
              key={d.month}
              className="rounded-lg bg-slate-200/60 dark:bg-slate-800/80 px-2 py-0.5 font-medium text-slate-700 dark:text-slate-300"
            >
              {d.month}: <strong className="text-sky-600 dark:text-sky-400">{d.growthText}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={{ stroke: gridColor }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => fmtCompact(v)}
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                borderColor: isDark ? '#334155' : '#e2e8f0',
                borderRadius: '0.75rem',
                fontSize: '12px',
              }}
              formatter={(val: number, name: string) => [
                fmtMetric(val, metric),
                name === 'PY' ? `PY (${period.pyYear})` : `CY (${period.cyYear})`,
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px' }}
              formatter={(v) => (v === 'PY' ? `PY (${period.pyYear})` : `CY (${period.cyYear})`)}
            />
            <Bar dataKey="PY" fill="#94a3b8" radius={[6, 6, 0, 0]} maxBarSize={32} />
            <Bar dataKey="CY" fill="#0284c7" radius={[6, 6, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
