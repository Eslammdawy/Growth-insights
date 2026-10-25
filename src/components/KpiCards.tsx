import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react';
import { fmtGrowth, fmtMetric, fmtSigned, metricUnitLabel } from '../lib/format';
import { metricCells } from '../lib/metrics';
import { useShallow } from 'zustand/react/shallow';
import { useDashboardStore } from '../store/useDashboardStore';

function MonthlySparkline({
  months,
  metric,
}: {
  months: { label: string; sums: { pyQ: number; pyV: number; cyQ: number; cyV: number } }[];
  metric: 'units' | 'value';
}) {
  if (!months || months.length === 0) return null;

  const points = months.map((m) => {
    const py = metric === 'units' ? m.sums.pyQ : m.sums.pyV;
    const cy = metric === 'units' ? m.sums.cyQ : m.sums.cyV;
    return { label: m.label, py, cy };
  });

  const allVals = points.flatMap((p) => [p.py, p.cy]);
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(1, ...allVals);
  const range = maxVal - minVal || 1;

  const width = 110;
  const height = 24;
  const paddingX = 6;
  const paddingY = 4;
  const usableW = width - paddingX * 2;
  const usableH = height - paddingY * 2;

  const getX = (idx: number) =>
    points.length === 1 ? width / 2 : paddingX + (idx / (points.length - 1)) * usableW;
  const getY = (val: number) =>
    height - paddingY - ((val - minVal) / range) * usableH;

  const pyCoords = points.map((p, i) => `${getX(i).toFixed(1)},${getY(p.py).toFixed(1)}`).join(' ');
  const cyCoords = points.map((p, i) => `${getX(i).toFixed(1)},${getY(p.cy).toFixed(1)}`).join(' ');

  return (
    <div className="mt-1.5 flex items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400">
      <div className="flex items-center gap-2 font-semibold">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
          PY
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-cyan-500" />
          CY
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-5 w-24 overflow-visible"
        aria-hidden="true"
      >
        <polyline
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="1.75"
          strokeDasharray="2.5 2"
          points={pyCoords}
        />
        <polyline
          fill="none"
          stroke="#06b6d4"
          strokeWidth="2"
          points={cyCoords}
        />
        {points.length > 0 && (
          <>
            <circle
              cx={getX(points.length - 1)}
              cy={getY(points[points.length - 1].py)}
              r="2.5"
              fill="#8b5cf6"
            />
            <circle
              cx={getX(points.length - 1)}
              cy={getY(points[points.length - 1].cy)}
              r="2.5"
              fill="#06b6d4"
            />
          </>
        )}
      </svg>
    </div>
  );
}

export const KpiCards: React.FC = () => {
  const { result, metric } = useDashboardStore(
    useShallow((s) => ({
      result: s.result,
      metric: s.metric,
    }))
  );
  if (!result) return null;

  const cells = metricCells(result.totals, metric);
  const unitLabel = metricUnitLabel(metric);
  const gText = fmtGrowth(cells.growth);

  const isUp = cells.status === 'growing' || cells.status === 'new';
  const isDown = cells.status === 'declining' || cells.status === 'lost';

  return (
    <section
      aria-label="Key Performance Indicators"
      aria-live="polite"
      className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {/* CY Total (with Prior Period in metadata) */}
      <div className="glass-panel relative overflow-hidden rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-white/95 via-cyan-50/40 to-sky-50/50 p-3.5 dark:border-cyan-500/30 dark:from-slate-900/95 dark:via-cyan-950/35 dark:to-sky-950/30">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600" />
        <div className="flex items-center justify-between text-xs font-semibold text-cyan-950/80 dark:text-cyan-200">
          <span>Current Period ({result.period.cyLabel})</span>
          <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-800 ring-1 ring-cyan-500/25 dark:bg-cyan-500/25 dark:text-cyan-200">
            {unitLabel}
          </span>
        </div>
        <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums">
          {fmtMetric(cells.cy, metric)}
        </div>
        <div className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
          Prior Period ({result.period.pyLabel}):{' '}
          <span className="font-semibold text-violet-700 dark:text-violet-300">
            {fmtMetric(cells.py, metric)}
          </span>
        </div>
      </div>

      {/* YoY Growth % */}
      <div
        className={`glass-panel relative overflow-hidden rounded-2xl border p-3.5 ${
          isUp
            ? 'border-emerald-200/80 bg-gradient-to-br from-white/95 via-emerald-50/40 to-teal-50/50 dark:border-emerald-500/30 dark:from-slate-900/95 dark:via-emerald-950/35 dark:to-teal-950/30'
            : isDown
              ? 'border-rose-200/80 bg-gradient-to-br from-white/95 via-rose-50/40 to-pink-50/50 dark:border-rose-500/30 dark:from-slate-900/95 dark:via-rose-950/35 dark:to-pink-950/30'
              : 'border-slate-200/80 p-3.5 dark:border-slate-800/80'
        }`}
      >
        <div
          className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${
            isUp
              ? 'from-emerald-500 via-teal-500 to-cyan-500'
              : isDown
                ? 'from-rose-500 via-pink-500 to-orange-500'
                : 'from-slate-400 to-slate-500'
          }`}
        />
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>YoY Growth %</span>
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold shadow-sm ${
              isUp
                ? 'bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:bg-emerald-500/25 dark:text-emerald-300'
                : isDown
                  ? 'bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30 dark:bg-rose-500/25 dark:text-rose-300'
                  : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
            }`}
          >
            {cells.growth.kind === 'new' ? (
              <Sparkles className="h-3 w-3" />
            ) : isUp ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : isDown ? (
              <ArrowDownRight className="h-3.5 w-3.5" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {cells.status.toUpperCase()}
          </span>
        </div>
        <div
          className={`mt-1.5 flex items-baseline gap-1.5 text-2xl font-extrabold tracking-tight tabular-nums ${
            isUp
              ? 'text-emerald-600 dark:text-emerald-400'
              : isDown
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-900 dark:text-white'
          }`}
        >
          <span>{isUp && cells.growth.kind === 'pct' ? '▲' : isDown ? '▼' : ''}</span>
          <span>{gText}</span>
        </div>
        <MonthlySparkline months={result.months} metric={metric} />
      </div>

      {/* YoY Growth (Δ) */}
      <div
        className={`glass-panel relative overflow-hidden rounded-2xl border p-3.5 ${
          isUp
            ? 'border-teal-200/80 bg-gradient-to-br from-white/95 via-teal-50/40 to-emerald-50/50 dark:border-teal-500/30 dark:from-slate-900/95 dark:via-teal-950/35 dark:to-emerald-950/30'
            : isDown
              ? 'border-orange-200/80 bg-gradient-to-br from-white/95 via-orange-50/40 to-rose-50/50 dark:border-orange-500/30 dark:from-slate-900/95 dark:via-orange-950/35 dark:to-rose-950/30'
              : 'border-slate-200/80 p-3.5 dark:border-slate-800/80'
        }`}
      >
        <div
          className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${
            isUp
              ? 'from-teal-500 via-emerald-500 to-green-500'
              : isDown
                ? 'from-orange-500 via-rose-500 to-red-500'
                : 'from-slate-400 to-slate-500'
          }`}
        />
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>YoY Growth (Δ)</span>
          <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-indigo-700 ring-1 ring-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-300">
            {result.matchedRows.toLocaleString('en-US')} tx rows
          </span>
        </div>
        <div
          className={`mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums ${
            isUp
              ? 'text-emerald-600 dark:text-emerald-400'
              : isDown
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-900 dark:text-white'
          }`}
        >
          {fmtSigned(cells.delta, metric)}
        </div>
        <div className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
          CY − PY ({unitLabel})
        </div>
      </div>
    </section>
  );
};
