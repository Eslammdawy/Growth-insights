import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react';
import { fmtGrowth, fmtMetric, fmtSigned, metricUnitLabel } from '../lib/format';
import { metricCells } from '../lib/metrics';
import { useDashboardStore } from '../store/useDashboardStore';

export const KpiCards: React.FC = () => {
  const { result, metric } = useDashboardStore();
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
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {/* PY Total */}
      <div className="glass-panel rounded-2xl border border-slate-200/70 dark:border-slate-800/80 p-4">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>Prior Period ({result.period.pyLabel})</span>
          <span className="rounded-md bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 text-[10px]">
            {unitLabel}
          </span>
        </div>
        <div className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums">
          {fmtMetric(cells.py, metric)}
        </div>
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
          Units: {fmtMetric(result.totals.pyQ, 'units')} · PPG: {fmtMetric(result.totals.pyQ ? result.totals.pyV / result.totals.pyQ : null, 'ppg')}
        </div>
      </div>

      {/* CY Total */}
      <div className="glass-panel rounded-2xl border border-slate-200/70 dark:border-slate-800/80 p-4">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>Current Period ({result.period.cyLabel})</span>
          <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
            {unitLabel}
          </span>
        </div>
        <div className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums">
          {fmtMetric(cells.cy, metric)}
        </div>
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
          Units: {fmtMetric(result.totals.cyQ, 'units')} · PPG: {fmtMetric(result.totals.cyQ ? result.totals.cyV / result.totals.cyQ : null, 'ppg')}
        </div>
      </div>

      {/* Growth % */}
      <div className="glass-panel rounded-2xl border border-slate-200/70 dark:border-slate-800/80 p-4">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>YoY Growth %</span>
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              isUp
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : isDown
                  ? 'bg-amber-600/15 text-amber-800 dark:text-amber-300'
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
          className={`mt-2 flex items-baseline gap-1.5 text-2xl font-extrabold tracking-tight tabular-nums ${
            isUp
              ? 'text-emerald-600 dark:text-emerald-400'
              : isDown
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-white'
          }`}
        >
          <span>{isUp && cells.growth.kind === 'pct' ? '▲' : isDown ? '▼' : ''}</span>
          <span>{gText}</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          Formula: (CY − PY) / |PY|
        </div>
      </div>

      {/* Delta Absolute */}
      <div className="glass-panel rounded-2xl border border-slate-200/70 dark:border-slate-800/80 p-4">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>Absolute Change (Δ)</span>
          <span className="text-[11px] tabular-nums text-slate-400">
            {result.matchedRows.toLocaleString('en-US')} tx rows
          </span>
        </div>
        <div
          className={`mt-2 text-2xl font-extrabold tracking-tight tabular-nums ${
            isUp
              ? 'text-emerald-600 dark:text-emerald-400'
              : isDown
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-white'
          }`}
        >
          {fmtSigned(cells.delta, metric)}
        </div>
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
          Δ Value: {fmtSigned(result.totals.cyV - result.totals.pyV, 'value')}
        </div>
      </div>
    </section>
  );
};
