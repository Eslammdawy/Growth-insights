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
    <div className="glass-panel relative flex flex-col overflow-hidden rounded-2xl border border-indigo-200/70 p-3.5 dark:border-slate-800/80">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500" />
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 dark:text-indigo-200">
            Monthly Trend ({METRIC_LABEL[metric]})
          </h2>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {period.pyYear} vs {period.cyYear} by month
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] tabular-nums">
          {data.map((d) => (
            <span
              key={d.month}
              className="rounded-lg border border-indigo-200/70 bg-indigo-50/70 px-2 py-0.5 font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
            >
              {d.month}: <strong className="text-indigo-600 dark:text-cyan-400">{d.growthText}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 12, left: 4, bottom: 0 }}>
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
              tickFormatter={(v) => fmtCompact(v)}
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                borderColor: isDark ? '#4f46e5' : '#c7d2fe',
                borderRadius: '0.75rem',
                fontSize: '12px',
              }}
              formatter={(val: number, name: string) => [
                fmtMetric(val, metric),
                name === 'PY' ? `PY (${period.pyYear})` : `CY (${period.cyYear})`,
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', fontWeight: 600 }}
              formatter={(v) => (v === 'PY' ? `PY (${period.pyYear})` : `CY (${period.cyYear})`)}
            />
            <Bar dataKey="PY" fill="url(#monthPyGrad)" radius={[6, 6, 0, 0]} maxBarSize={34} />
            <Bar dataKey="CY" fill="url(#monthCyGrad)" radius={[6, 6, 0, 0]} maxBarSize={34} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
